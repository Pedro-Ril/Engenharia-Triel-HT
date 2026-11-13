import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";

import type { PrioridadeChamado, StatusChamado } from "./chamados";

/*
 * Dados do BI de chamados para TV (/chamados/dashboard/tv) -- rota
 * PÚBLICA, roda numa TV da sala sem ninguém logado (mesmo padrão do BI
 * de Equipamentos Usados). Por isso aqui não há escopo por usuário: todos
 * os setores, ou um só via ?setor= na URL.
 *
 * "Em aberto" = trabalho do time: status aberto ou em andamento.
 * Aguardando confirmação está com o solicitante -- entra só no indicador.
 */

const STATUS_EM_ABERTO = "c.[status] IN ('aberto', 'em_andamento')";
const DIAS_GRAFICO = 30;
const LIMITE_TABELA = 200;

export interface ChamadoTv {
  numero: number;
  titulo: string;
  setorNome: string;
  categoriaNome: string | null;
  solicitanteNome: string;
  solicitanteDepartamento: string | null;
  atendenteNome: string | null;
  status: StatusChamado;
  prioridade: PrioridadeChamado;
  criadoEm: string;
  minutosAberto: number;
}

export interface PainelTvChamados {
  atualizadoEm: string;
  setorNome: string | null;
  totais: {
    emAberto: number;
    semAtendente: number;
    urgentesEmAberto: number;
    emAndamento: number;
    aguardandoConfirmacao: number;
    abertosHoje: number;
    resolvidosHoje: number;
    tempoMedioResolucaoHoras: number | null;
  };
  /* Últimos 30 dias, dia a dia (dias sem nada vêm com zero). */
  porDia: { dia: string; abertos: number; resolvidos: number }[];
  porPrioridade: { prioridade: PrioridadeChamado; total: number }[];
  porCategoria: { categoria: string; total: number }[];
  porAtendente: { atendente: string; total: number }[];
  /* Sem ninguém atendendo, do que espera há mais tempo para o mais novo. */
  aguardandoAtendente: ChamadoTv[];
  resolvidosRecentes: { numero: number; titulo: string; atendenteNome: string | null; resolvidoEm: string }[];
  /* Tabela: sem atendente primeiro, depois prioridade e os mais antigos. */
  emAberto: ChamadoTv[];
  emAbertoTotal: number;
}

const PADRAO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function setorDaUrlTv(valor: string | null): string | null {
  return valor && PADRAO_UUID.test(valor) ? valor : null;
}

interface ChamadoTvRow {
  numero: number;
  titulo: string;
  setor_nome: string;
  categoria_nome: string | null;
  solicitante_nome: string | null;
  solicitante_departamento: string | null;
  atendente_nome: string | null;
  status: string;
  prioridade: string;
  criado_em: string;
  minutos_aberto: number;
}

const colunasChamadoTv = `
  c.[numero],
  c.[titulo],
  s.[nome] AS [setor_nome],
  cat.[nome] AS [categoria_nome],
  c.[solicitante_nome],
  c.[solicitante_departamento],
  atendente.[nome_exibicao] AS [atendente_nome],
  c.[status],
  c.[prioridade],
  CONVERT(VARCHAR(33), c.[criado_em], 126) AS [criado_em],
  DATEDIFF(MINUTE, c.[criado_em], SYSDATETIME()) AS [minutos_aberto]
`;

const juncoesChamadoTv = `
  FROM dbo.portal_chamados AS c
  INNER JOIN dbo.portal_setores AS s ON s.[id] = c.[setor_id]
  LEFT JOIN dbo.portal_chamados_categorias AS cat ON cat.[id] = c.[categoria_id]
  LEFT JOIN dbo.portal_usuarios AS atendente ON atendente.[id] = c.[atendente_usuario_id]
`;

/* Urgente primeiro -- usado no ORDER BY da tabela. */
const ORDEM_PRIORIDADE_SQL = `
  CASE c.[prioridade] WHEN 'urgente' THEN 0 WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END
`;

function mapChamadoTv(row: ChamadoTvRow): ChamadoTv {
  return {
    numero: row.numero,
    titulo: row.titulo,
    setorNome: row.setor_nome,
    categoriaNome: row.categoria_nome,
    solicitanteNome: row.solicitante_nome ?? "",
    solicitanteDepartamento: row.solicitante_departamento,
    atendenteNome: row.atendente_nome,
    status: row.status as StatusChamado,
    prioridade: row.prioridade as PrioridadeChamado,
    criadoEm: row.criado_em,
    minutosAberto: Math.max(0, row.minutos_aberto),
  };
}

export async function obterPainelTvChamados(setorId: string | null): Promise<PainelTvChamados> {
  const pool = await getSqlServerPool();
  const filtroSetor = setorId ? "AND c.[setor_id] = @setorId" : "";

  /* Cada consulta com o próprio Request (o driver não reaproveita um Request em paralelo). */
  const consultar = <T>(query: string) => {
    const request = pool.request();
    if (setorId) request.input("setorId", sql.UniqueIdentifier, setorId);
    request.input("dias", sql.Int, DIAS_GRAFICO);
    request.input("limite", sql.Int, LIMITE_TABELA);
    return request.query<T>(query);
  };

  const [
    setorResult,
    totaisResult,
    porDiaResult,
    prioridadeResult,
    categoriaResult,
    atendenteResult,
    aguardandoResult,
    resolvidosResult,
    tabelaResult,
  ] = await Promise.all([
    setorId
      ? consultar<{ nome: string }>(`SELECT [nome] FROM dbo.portal_setores WHERE [id] = @setorId;`)
      : Promise.resolve(null),
    consultar<{
      em_aberto: number;
      sem_atendente: number;
      urgentes: number;
      em_andamento: number;
      aguardando: number;
      abertos_hoje: number;
      resolvidos_hoje: number;
      horas_media: number | null;
      hoje: string;
    }>(`
      SELECT
        SUM(CASE WHEN ${STATUS_EM_ABERTO} THEN 1 ELSE 0 END) AS [em_aberto],
        SUM(CASE WHEN ${STATUS_EM_ABERTO} AND c.[atendente_usuario_id] IS NULL THEN 1 ELSE 0 END) AS [sem_atendente],
        SUM(CASE WHEN ${STATUS_EM_ABERTO} AND c.[prioridade] = 'urgente' THEN 1 ELSE 0 END) AS [urgentes],
        SUM(CASE WHEN c.[status] = 'em_andamento' THEN 1 ELSE 0 END) AS [em_andamento],
        SUM(CASE WHEN c.[status] = 'aguardando_confirmacao' THEN 1 ELSE 0 END) AS [aguardando],
        SUM(CASE WHEN CAST(c.[criado_em] AS DATE) = CAST(SYSDATETIME() AS DATE) THEN 1 ELSE 0 END) AS [abertos_hoje],
        SUM(CASE WHEN CAST(c.[resolvido_em] AS DATE) = CAST(SYSDATETIME() AS DATE) THEN 1 ELSE 0 END) AS [resolvidos_hoje],
        AVG(CASE WHEN c.[resolvido_em] >= DATEADD(DAY, -@dias, SYSDATETIME())
                 THEN CAST(DATEDIFF(MINUTE, c.[criado_em], c.[resolvido_em]) AS FLOAT) END) / 60.0 AS [horas_media],
        CONVERT(VARCHAR(10), SYSDATETIME(), 23) AS [hoje]
      FROM dbo.portal_chamados AS c
      WHERE 1 = 1 ${filtroSetor};
    `),
    consultar<{ dia: string; abertos: number; resolvidos: number }>(`
      WITH eventos AS (
        SELECT CAST(c.[criado_em] AS DATE) AS [dia], 1 AS [aberto], 0 AS [resolvido]
        FROM dbo.portal_chamados AS c
        WHERE c.[criado_em] >= DATEADD(DAY, 1 - @dias, CAST(SYSDATETIME() AS DATE)) ${filtroSetor}
        UNION ALL
        SELECT CAST(c.[resolvido_em] AS DATE), 0, 1
        FROM dbo.portal_chamados AS c
        WHERE c.[resolvido_em] >= DATEADD(DAY, 1 - @dias, CAST(SYSDATETIME() AS DATE)) ${filtroSetor}
      )
      SELECT CONVERT(VARCHAR(10), [dia], 23) AS [dia], SUM([aberto]) AS [abertos], SUM([resolvido]) AS [resolvidos]
      FROM eventos
      GROUP BY [dia];
    `),
    consultar<{ prioridade: string; total: number }>(`
      SELECT c.[prioridade], COUNT(*) AS [total]
      FROM dbo.portal_chamados AS c
      WHERE ${STATUS_EM_ABERTO} ${filtroSetor}
      GROUP BY c.[prioridade];
    `),
    consultar<{ categoria: string | null; total: number }>(`
      SELECT TOP 8 cat.[nome] AS [categoria], COUNT(*) AS [total]
      FROM dbo.portal_chamados AS c
      LEFT JOIN dbo.portal_chamados_categorias AS cat ON cat.[id] = c.[categoria_id]
      WHERE ${STATUS_EM_ABERTO} ${filtroSetor}
      GROUP BY cat.[nome]
      ORDER BY COUNT(*) DESC;
    `),
    consultar<{ atendente: string | null; total: number }>(`
      SELECT TOP 8 u.[nome_exibicao] AS [atendente], COUNT(*) AS [total]
      FROM dbo.portal_chamados AS c
      LEFT JOIN dbo.portal_usuarios AS u ON u.[id] = c.[atendente_usuario_id]
      WHERE ${STATUS_EM_ABERTO} ${filtroSetor}
      GROUP BY u.[nome_exibicao]
      ORDER BY COUNT(*) DESC;
    `),
    consultar<ChamadoTvRow>(`
      SELECT TOP 8 ${colunasChamadoTv}
      ${juncoesChamadoTv}
      WHERE ${STATUS_EM_ABERTO} AND c.[atendente_usuario_id] IS NULL ${filtroSetor}
      ORDER BY c.[criado_em] ASC;
    `),
    consultar<{ numero: number; titulo: string; atendente_nome: string | null; resolvido_em: string }>(`
      SELECT TOP 6
        c.[numero],
        c.[titulo],
        u.[nome_exibicao] AS [atendente_nome],
        CONVERT(VARCHAR(33), c.[resolvido_em], 126) AS [resolvido_em]
      FROM dbo.portal_chamados AS c
      LEFT JOIN dbo.portal_usuarios AS u ON u.[id] = c.[atendente_usuario_id]
      WHERE c.[resolvido_em] IS NOT NULL ${filtroSetor}
      ORDER BY c.[resolvido_em] DESC;
    `),
    consultar<ChamadoTvRow>(`
      SELECT TOP (@limite) ${colunasChamadoTv}
      ${juncoesChamadoTv}
      WHERE ${STATUS_EM_ABERTO} ${filtroSetor}
      ORDER BY
        CASE WHEN c.[atendente_usuario_id] IS NULL THEN 0 ELSE 1 END,
        ${ORDEM_PRIORIDADE_SQL},
        c.[criado_em] ASC;
    `),
  ]);

  const totais = totaisResult.recordset[0];

  /* Preenche os 30 dias (hoje vem do próprio banco, mesmo relógio das datas gravadas). */
  const porDiaMapa = new Map(porDiaResult.recordset.map((row) => [row.dia, row]));
  const hoje = new Date(`${totais?.hoje ?? new Date().toISOString().slice(0, 10)}T12:00:00`);
  const porDia = Array.from({ length: DIAS_GRAFICO }, (_, indice) => {
    const data = new Date(hoje);
    data.setDate(hoje.getDate() - (DIAS_GRAFICO - 1 - indice));
    const pad = (valor: number) => String(valor).padStart(2, "0");
    const dia = `${data.getFullYear()}-${pad(data.getMonth() + 1)}-${pad(data.getDate())}`;
    const registro = porDiaMapa.get(dia);
    return { dia, abertos: registro?.abertos ?? 0, resolvidos: registro?.resolvidos ?? 0 };
  });

  return {
    atualizadoEm: new Date().toISOString(),
    setorNome: setorResult?.recordset[0]?.nome ?? null,
    totais: {
      emAberto: totais?.em_aberto ?? 0,
      semAtendente: totais?.sem_atendente ?? 0,
      urgentesEmAberto: totais?.urgentes ?? 0,
      emAndamento: totais?.em_andamento ?? 0,
      aguardandoConfirmacao: totais?.aguardando ?? 0,
      abertosHoje: totais?.abertos_hoje ?? 0,
      resolvidosHoje: totais?.resolvidos_hoje ?? 0,
      tempoMedioResolucaoHoras: totais?.horas_media ?? null,
    },
    porDia,
    porPrioridade: prioridadeResult.recordset.map((row) => ({
      prioridade: row.prioridade as PrioridadeChamado,
      total: row.total,
    })),
    porCategoria: categoriaResult.recordset.map((row) => ({
      categoria: row.categoria ?? "Sem categoria",
      total: row.total,
    })),
    porAtendente: atendenteResult.recordset.map((row) => ({
      atendente: row.atendente ?? "Sem atendente",
      total: row.total,
    })),
    aguardandoAtendente: aguardandoResult.recordset.map(mapChamadoTv),
    resolvidosRecentes: resolvidosResult.recordset.map((row) => ({
      numero: row.numero,
      titulo: row.titulo,
      atendenteNome: row.atendente_nome,
      resolvidoEm: row.resolvido_em,
    })),
    emAberto: tabelaResult.recordset.map(mapChamadoTv),
    emAbertoTotal: totais?.em_aberto ?? 0,
  };
}
