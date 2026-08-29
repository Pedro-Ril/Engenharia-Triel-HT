import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";

export type ServicoExterno = "active_directory" | "erp_materia_prima" | "email";
export type OrigemChamadaExterna = "health_check" | "uso_real";

export interface StatusServicoExterno {
  servico: ServicoExterno;
  status: "online" | "offline" | "sem_dados";
  latenciaMediaMs: number | null;
  totalChamadas24h: number;
  taxaSucesso24h: number | null;
  ultimaChamadaEm: string | null;
  ultimaFalhaEm: string | null;
  ultimaFalhaMensagem: string | null;
}

/*
 * Nunca lança — chamada tanto no caminho de checagem ativa (agendador
 * de AD) quanto passivamente em pontos de uso real (login, envio de
 * e-mail). Se o próprio registro falhar, só loga no console; nunca
 * pode atrapalhar o fluxo real que está sendo medido.
 */
export async function registrarChamadaExternaSemFalhar(params: {
  servico: ServicoExterno;
  origem: OrigemChamadaExterna;
  sucesso: boolean;
  duracaoMs: number;
  mensagemErro?: string | null;
}): Promise<void> {
  try {
    const pool = await getSqlServerPool();
    const request = pool.request();

    request.input("servico", sql.VarChar(40), params.servico);
    request.input("origem", sql.VarChar(20), params.origem);
    request.input("sucesso", sql.Bit, params.sucesso);
    request.input("duracaoMs", sql.Int, Math.round(params.duracaoMs));
    request.input("mensagemErro", sql.NVarChar(500), params.mensagemErro?.slice(0, 500) ?? null);

    await request.query(`
      INSERT INTO dbo.portal_monitoramento_chamadas_externas
        ([servico], [origem], [sucesso], [duracao_ms], [mensagem_erro])
      VALUES (@servico, @origem, @sucesso, @duracaoMs, @mensagemErro);
    `);
  } catch (error) {
    console.error("Erro ao registrar chamada externa de monitoramento:", error);
  }
}

interface ResumoChamadasRow {
  servico: ServicoExterno;
  total24h: number;
  sucessos24h: number;
  latenciaMedia24h: number | null;
  ultimaChamadaEm: Date | null;
  ultimoSucesso: boolean | null;
}

async function obterResumoTabelaChamadas(
  pool: Awaited<ReturnType<typeof getSqlServerPool>>
): Promise<Map<ServicoExterno, ResumoChamadasRow>> {
  const resumo24h = await pool.request().query<{
    servico: ServicoExterno;
    total24h: number;
    sucessos24h: number;
    latenciaMedia24h: number | null;
  }>(`
    SELECT
      [servico],
      COUNT(*) AS [total24h],
      SUM(CASE WHEN [sucesso] = 1 THEN 1 ELSE 0 END) AS [sucessos24h],
      AVG(CAST([duracao_ms] AS FLOAT)) AS [latenciaMedia24h]
    FROM dbo.portal_monitoramento_chamadas_externas
    WHERE [criado_em] >= DATEADD(HOUR, -24, SYSDATETIME())
    GROUP BY [servico];
  `);

  const ultimas = await pool.request().query<{
    servico: ServicoExterno;
    criado_em: Date;
    sucesso: boolean;
  }>(`
    SELECT [servico], [criado_em], [sucesso]
    FROM dbo.portal_monitoramento_chamadas_externas AS atual
    WHERE [criado_em] = (
      SELECT MAX([criado_em])
      FROM dbo.portal_monitoramento_chamadas_externas AS maisRecente
      WHERE maisRecente.[servico] = atual.[servico]
    );
  `);

  const mapa = new Map<ServicoExterno, ResumoChamadasRow>();

  for (const row of resumo24h.recordset) {
    mapa.set(row.servico, {
      servico: row.servico,
      total24h: row.total24h,
      sucessos24h: row.sucessos24h,
      latenciaMedia24h: row.latenciaMedia24h,
      ultimaChamadaEm: null,
      ultimoSucesso: null,
    });
  }

  for (const row of ultimas.recordset) {
    const existente = mapa.get(row.servico);
    if (existente) {
      existente.ultimaChamadaEm = row.criado_em;
      existente.ultimoSucesso = row.sucesso;
    } else {
      mapa.set(row.servico, {
        servico: row.servico,
        total24h: 0,
        sucessos24h: 0,
        latenciaMedia24h: null,
        ultimaChamadaEm: row.criado_em,
        ultimoSucesso: row.sucesso,
      });
    }
  }

  return mapa;
}

async function obterUltimaFalha(
  pool: Awaited<ReturnType<typeof getSqlServerPool>>,
  servico: ServicoExterno
): Promise<{ criadoEm: string | null; mensagem: string | null }> {
  const request = pool.request();
  request.input("servico", sql.VarChar(40), servico);

  const result = await request.query<{ criado_em: Date; mensagem_erro: string | null }>(`
    SELECT TOP 1 [criado_em], [mensagem_erro]
    FROM dbo.portal_monitoramento_chamadas_externas
    WHERE [servico] = @servico AND [sucesso] = 0
    ORDER BY [criado_em] DESC;
  `);

  const row = result.recordset[0];
  if (!row) return { criadoEm: null, mensagem: null };

  return { criadoEm: row.criado_em.toISOString(), mensagem: row.mensagem_erro };
}

function montarStatus(
  servico: ServicoExterno,
  resumo: ResumoChamadasRow | undefined,
  ultimaFalha: { criadoEm: string | null; mensagem: string | null }
): StatusServicoExterno {
  if (!resumo || resumo.ultimaChamadaEm === null) {
    return {
      servico,
      status: "sem_dados",
      latenciaMediaMs: null,
      totalChamadas24h: 0,
      taxaSucesso24h: null,
      ultimaChamadaEm: null,
      ultimaFalhaEm: ultimaFalha.criadoEm,
      ultimaFalhaMensagem: ultimaFalha.mensagem,
    };
  }

  return {
    servico,
    status: resumo.ultimoSucesso ? "online" : "offline",
    latenciaMediaMs: resumo.latenciaMedia24h !== null ? Math.round(resumo.latenciaMedia24h) : null,
    totalChamadas24h: resumo.total24h,
    taxaSucesso24h: resumo.total24h > 0 ? resumo.sucessos24h / resumo.total24h : null,
    ultimaChamadaEm: resumo.ultimaChamadaEm.toISOString(),
    ultimaFalhaEm: ultimaFalha.criadoEm,
    ultimaFalhaMensagem: ultimaFalha.mensagem,
  };
}

interface SincronizacaoErpRow {
  status: "sucesso" | "cancelado" | "erro";
  iniciado_em: Date;
  finalizado_em: Date | null;
  mensagem_erro: string | null;
}

/*
 * ERP de Matéria-Prima já loga cada sincronização (manual ou
 * automática) em eng_man_sincronizacao_logs — não duplica dado numa
 * tabela nova, só lê e reformata pro mesmo formato dos outros dois
 * serviços.
 */
async function obterStatusErp(
  pool: Awaited<ReturnType<typeof getSqlServerPool>>
): Promise<StatusServicoExterno> {
  const recentes = await pool.request().query<SincronizacaoErpRow>(`
    SELECT TOP 20 [status], [iniciado_em], [finalizado_em], [mensagem_erro]
    FROM dbo.eng_man_sincronizacao_logs
    WHERE [finalizado_em] IS NOT NULL
    ORDER BY [iniciado_em] DESC;
  `);

  /*
   * "Cancelado" é uma ação deliberada do admin, não um sinal de saúde
   * do ERP — nem indica que o serviço está fora do ar, nem tem uma
   * "duração" que signifique latência real (o relógio só para quando
   * alguém clica em cancelar, podia ser horas depois). Ignorado por
   * completo aqui: só sucesso/erro entram nas métricas de status,
   * latência e taxa de sucesso.
   */
  const relevantes = recentes.recordset.filter((item) => item.status !== "cancelado");
  const ultima = relevantes[0];

  if (!ultima) {
    return {
      servico: "erp_materia_prima",
      status: "sem_dados",
      latenciaMediaMs: null,
      totalChamadas24h: 0,
      taxaSucesso24h: null,
      ultimaChamadaEm: null,
      ultimaFalhaEm: null,
      ultimaFalhaMensagem: null,
    };
  }

  const janela24h = relevantes.filter(
    (item) => Date.now() - item.iniciado_em.getTime() < 24 * 60 * 60 * 1000
  );
  const sucessos24h = janela24h.filter((item) => item.status === "sucesso").length;

  const duracoes = janela24h
    .filter((item) => item.finalizado_em)
    .map((item) => item.finalizado_em!.getTime() - item.iniciado_em.getTime());
  const latenciaMediaMs =
    duracoes.length > 0 ? Math.round(duracoes.reduce((a, b) => a + b, 0) / duracoes.length) : null;

  const ultimaFalha = relevantes.find((item) => item.status === "erro");

  return {
    servico: "erp_materia_prima",
    status: ultima.status === "sucesso" ? "online" : "offline",
    latenciaMediaMs,
    totalChamadas24h: janela24h.length,
    taxaSucesso24h: janela24h.length > 0 ? sucessos24h / janela24h.length : null,
    ultimaChamadaEm: ultima.iniciado_em.toISOString(),
    ultimaFalhaEm: ultimaFalha ? ultimaFalha.iniciado_em.toISOString() : null,
    ultimaFalhaMensagem: ultimaFalha?.mensagem_erro ?? null,
  };
}

export async function obterResumoChamadasExternas(): Promise<StatusServicoExterno[]> {
  const pool = await getSqlServerPool();

  const [resumoTabela, ultimaFalhaAd, ultimaFalhaEmail, statusErp] = await Promise.all([
    obterResumoTabelaChamadas(pool),
    obterUltimaFalha(pool, "active_directory"),
    obterUltimaFalha(pool, "email"),
    obterStatusErp(pool),
  ]);

  return [
    montarStatus("active_directory", resumoTabela.get("active_directory"), ultimaFalhaAd),
    statusErp,
    montarStatus("email", resumoTabela.get("email"), ultimaFalhaEmail),
  ];
}
