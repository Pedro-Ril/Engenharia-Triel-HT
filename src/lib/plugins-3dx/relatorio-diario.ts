import "server-only";

import { ValidationError } from "@/lib/auth/errors";
import { getSqlServerPool, sql } from "@/lib/database/sql-server";
import { enviarEmail } from "@/lib/smtp/enviar-email";
import type { AnexoEmail } from "@/lib/smtp/enviar-email";
import { montarEmailHtml } from "@/lib/smtp/template-email";
import type {
  Ambiente3dx,
  EnvioRelatorio3dx,
  EnviosRelatorio3dx,
  EscopoRelatorio3dx,
  Execucao3dx,
  ModoPlugin3dx,
} from "@/modules/plugins-3dx/types/plugins3dx.types";

import {
  assuntoEmail,
  gerarExcel,
  gerarPdf,
  montarCorpoEmail,
} from "./relatorio-diario-arquivos";
import type { DadosRelatorio3dx, DiaRelatorio3dx, ItemRelatorio3dx, ModoAtualPlugin3dx } from "./relatorio-diario-arquivos";

/*
 * Relatório diário de uso dos Plugins 3DX (evento "relatorio_diario", aviso geral -- sem plugin).
 *
 * Todo dia, a partir de HORA_ENVIO, manda o uso do DIA ANTERIOR para a lista do evento: resumo gerencial no corpo
 * e o detalhado em PDF + Excel anexos. Cada destinatário recebe o escopo que escolheu:
 *  - sem ambiente -> um relatório com produção e teste (escopo AMBOS);
 *  - com ambiente -> só aquele ambiente (escopo PRODUCAO ou TESTE).
 * Um registro em portal_3dx_plugins_relatorios (migração 0176) por dia + escopo é a "reserva" do envio: quem
 * insere primeiro envia (o dev e o servidor de produção do Portal rodam o agendador no mesmo banco). Falha tenta
 * de novo até 3 vezes, com 30 min de intervalo. Dia sem uso também é enviado (confirma que o monitoramento está vivo).
 */

export const HORA_ENVIO = 7;
const INTERVALO_MS = 10 * 60 * 1000;
const MAX_TENTATIVAS = 3;
const DIAS_TENDENCIA = 7;

const ACOES_ALTERACAO = "'titulo_alterado', 'instancia_substituida', 'revisao_obsoleta', 'vinculo_criado'";

declare global {
  var plugins3dxRelatorioAgendadorIniciado: boolean | undefined;
  var plugins3dxRelatorioVerificando: boolean | undefined;
}

const DATA = /^\d{4}-\d{2}-\d{2}$/;

/* "AAAA-MM-DD" do dia local (o servidor e o banco estão no mesmo fuso; as datas do banco são hora local). */
function dataLocal(data: Date): string {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

export function ontem(): string {
  const data = new Date();
  data.setDate(data.getDate() - 1);
  return dataLocal(data);
}

export function validarDataRelatorio(valor: unknown): string {
  if (typeof valor !== "string" || !DATA.test(valor)) throw new ValidationError("Informe o dia (AAAA-MM-DD).");
  const [ano, mes, dia] = valor.split("-").map(Number);
  const data = new Date(ano, mes - 1, dia);
  if (data.getFullYear() !== ano || data.getMonth() !== mes - 1 || data.getDate() !== dia) {
    throw new ValidationError("Dia inválido.");
  }
  if (valor > dataLocal(new Date())) throw new ValidationError("O dia não pode ser no futuro.");
  return valor;
}

// ------------------------------------------------------------------ dados

interface ExecucaoRow {
  id: string;
  plugin_chave: string;
  ambiente: Ambiente3dx;
  gatilho: Execucao3dx["gatilho"];
  modo: ModoPlugin3dx;
  status: Execucao3dx["status"];
  correlacao_id: string | null;
  objeto_nome: string | null;
  objeto_revisao: string | null;
  objeto_titulo: string | null;
  objeto_tipo: string | null;
  ator_login: string | null;
  ator_nome: string | null;
  solicitado_por_nome: string | null;
  no: string | null;
  tentativas: number;
  enfileirado_em: string;
  iniciado_em: string | null;
  finalizado_em: string | null;
  duracao_ms: number | null;
  total_itens: number | null;
  total_ok: number | null;
  total_falhas: number | null;
  resumo: string | null;
  erro: string | null;
}

interface ItemRow {
  id: string;
  execucao_id: string;
  ordem: number;
  acao: string;
  sucesso: boolean;
  alvo_nome: string | null;
  alvo_revisao: string | null;
  alvo_titulo: string | null;
  alvo_tipo: string | null;
  alvo_estado: string | null;
  alvo_owner: string | null;
  valor_antes: string | null;
  valor_depois: string | null;
  mensagem: string | null;
}

/* Filtro do dia (hora local, como o banco grava) + ambiente opcional, nos aliases "e." das consultas abaixo. */
const FILTRO_DIA = `e.[enfileirado_em] >= @dia AND e.[enfileirado_em] < DATEADD(DAY, 1, CAST(@dia AS DATETIME2))
  AND (@ambiente IS NULL OR e.[ambiente] = @ambiente)`;

export async function carregarDadosRelatorio(data: string, ambiente: Ambiente3dx | null): Promise<DadosRelatorio3dx> {
  const pool = await getSqlServerPool();
  const requisicao = () =>
    pool.request().input("dia", sql.Date, data).input("ambiente", sql.VarChar(10), ambiente);

  const [execucoes, itens, dias, modos] = await Promise.all([
    requisicao().query<ExecucaoRow>(`
      SELECT CONVERT(VARCHAR(36), e.[id]) AS [id], e.[plugin_chave], e.[ambiente], e.[gatilho], e.[modo], e.[status],
        CONVERT(VARCHAR(36), e.[correlacao_id]) AS [correlacao_id], e.[objeto_nome], e.[objeto_revisao],
        e.[objeto_titulo], e.[objeto_tipo], e.[ator_login], u.[nome_exibicao] AS [ator_nome], e.[solicitado_por_nome],
        e.[no], e.[tentativas],
        CONVERT(VARCHAR(33), e.[enfileirado_em], 126) AS [enfileirado_em],
        CONVERT(VARCHAR(33), e.[iniciado_em], 126) AS [iniciado_em],
        CONVERT(VARCHAR(33), e.[finalizado_em], 126) AS [finalizado_em],
        e.[duracao_ms], e.[total_itens], e.[total_ok], e.[total_falhas], e.[resumo], e.[erro]
      FROM dbo.portal_3dx_plugins_execucoes e
      LEFT JOIN dbo.portal_usuarios u ON u.[id] = e.[ator_usuario_id]
      WHERE ${FILTRO_DIA}
      ORDER BY e.[enfileirado_em];
    `),
    requisicao().query<ItemRow>(`
      SELECT CONVERT(VARCHAR(36), i.[id]) AS [id], CONVERT(VARCHAR(36), i.[execucao_id]) AS [execucao_id], i.[ordem],
        i.[acao], i.[sucesso], i.[alvo_nome], i.[alvo_revisao], i.[alvo_titulo], i.[alvo_tipo], i.[alvo_estado],
        i.[alvo_owner], i.[valor_antes], i.[valor_depois], i.[mensagem]
      FROM dbo.portal_3dx_plugins_itens i
      JOIN dbo.portal_3dx_plugins_execucoes e ON e.[id] = i.[execucao_id]
      WHERE ${FILTRO_DIA}
      ORDER BY e.[enfileirado_em], i.[ordem];
    `),
    /* Tendência: os 7 dias que terminam no dia do relatório. */
    requisicao()
      .input("dias", sql.Int, DIAS_TENDENCIA - 1)
      .query<{ dia: string; execucoes: number; com_falha: number; alteracoes: number }>(`
        SELECT CONVERT(VARCHAR(10), CAST(e.[enfileirado_em] AS DATE), 23) AS [dia],
          COUNT(*) AS [execucoes],
          SUM(CASE WHEN e.[status] IN ('falha', 'parcial') THEN 1 ELSE 0 END) AS [com_falha],
          SUM(a.[alteracoes]) AS [alteracoes]
        FROM dbo.portal_3dx_plugins_execucoes e
        OUTER APPLY (
          SELECT COUNT(*) AS [alteracoes] FROM dbo.portal_3dx_plugins_itens i
          WHERE i.[execucao_id] = e.[id] AND i.[sucesso] = 1 AND i.[acao] IN (${ACOES_ALTERACAO})
        ) a
        WHERE e.[enfileirado_em] >= DATEADD(DAY, -@dias, CAST(@dia AS DATETIME2))
          AND e.[enfileirado_em] < DATEADD(DAY, 1, CAST(@dia AS DATETIME2))
          AND (@ambiente IS NULL OR e.[ambiente] = @ambiente)
        GROUP BY CAST(e.[enfileirado_em] AS DATE);
      `),
    pool.request().query<{ plugin_chave: string; ambiente: Ambiente3dx; modo: ModoPlugin3dx }>(
      "SELECT [plugin_chave], [ambiente], [modo] FROM dbo.portal_3dx_plugins_ambientes;"
    ),
  ]);

  const porDia = new Map(dias.recordset.map((d) => [d.dia, d]));
  const [ano, mes, dia] = data.split("-").map(Number);
  const ultimosDias: DiaRelatorio3dx[] = [];
  for (let i = DIAS_TENDENCIA - 1; i >= 0; i -= 1) {
    const chave = dataLocal(new Date(ano, mes - 1, dia - i));
    const linha = porDia.get(chave);
    ultimosDias.push({
      data: chave,
      execucoes: linha?.execucoes ?? 0,
      comFalha: linha?.com_falha ?? 0,
      alteracoes: linha?.alteracoes ?? 0,
    });
  }

  return {
    data,
    ambiente,
    execucoes: execucoes.recordset.map(
      (row): Execucao3dx => ({
        id: row.id.toLowerCase(),
        pluginChave: row.plugin_chave,
        ambiente: row.ambiente,
        gatilho: row.gatilho,
        modo: row.modo,
        status: row.status,
        correlacaoId: row.correlacao_id?.toLowerCase() ?? null,
        objetoNome: row.objeto_nome,
        objetoRevisao: row.objeto_revisao,
        objetoTitulo: row.objeto_titulo,
        objetoTipo: row.objeto_tipo,
        atorLogin: row.ator_login,
        atorNome: row.ator_nome,
        solicitadoPorNome: row.solicitado_por_nome,
        no: row.no,
        tentativas: row.tentativas,
        enfileiradoEm: row.enfileirado_em,
        iniciadoEm: row.iniciado_em,
        finalizadoEm: row.finalizado_em,
        duracaoMs: row.duracao_ms,
        totalItens: row.total_itens,
        totalOk: row.total_ok,
        totalFalhas: row.total_falhas,
        resumo: row.resumo,
        erro: row.erro,
      })
    ),
    itens: itens.recordset.map(
      (row): ItemRelatorio3dx => ({
        id: row.id.toLowerCase(),
        execucaoId: row.execucao_id.toLowerCase(),
        ordem: row.ordem,
        acao: row.acao,
        sucesso: row.sucesso,
        alvoNome: row.alvo_nome,
        alvoRevisao: row.alvo_revisao,
        alvoTitulo: row.alvo_titulo,
        alvoTipo: row.alvo_tipo,
        alvoEstado: row.alvo_estado,
        alvoOwner: row.alvo_owner,
        valorAntes: row.valor_antes,
        valorDepois: row.valor_depois,
        mensagem: row.mensagem,
      })
    ),
    ultimosDias,
    modos: modos.recordset.map(
      (m): ModoAtualPlugin3dx => ({ pluginChave: m.plugin_chave, ambiente: m.ambiente, modo: m.modo })
    ),
  };
}

export function nomeArquivoRelatorio(data: string, ambiente: Ambiente3dx | null, extensao: "pdf" | "xlsx"): string {
  const escopo = ambiente ? `-${ambiente.toLowerCase()}` : "";
  return `plugins-3dx-relatorio-${data}${escopo}.${extensao}`;
}

export const TIPO_PDF = "application/pdf";
export const TIPO_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function anexos(dados: DadosRelatorio3dx): AnexoEmail[] {
  return [
    { nomeArquivo: nomeArquivoRelatorio(dados.data, dados.ambiente, "pdf"), conteudo: gerarPdf(dados), tipoConteudo: TIPO_PDF },
    {
      nomeArquivo: nomeArquivoRelatorio(dados.data, dados.ambiente, "xlsx"),
      conteudo: gerarExcel(dados),
      tipoConteudo: TIPO_XLSX,
    },
  ];
}

/* Monta e envia um relatório para os e-mails dados. Devolve quantas execuções o dia teve. */
export async function enviarRelatorio(
  data: string,
  ambiente: Ambiente3dx | null,
  emails: string[]
): Promise<number> {
  const dados = await carregarDadosRelatorio(data, ambiente);
  await enviarEmail({
    destinatario: emails,
    assunto: assuntoEmail(dados).slice(0, 300),
    corpoHtml: montarEmailHtml(montarCorpoEmail(dados)),
    anexos: anexos(dados),
  });
  return dados.execucoes.length;
}

// ------------------------------------------------------------------ agendador

/* E-mails da lista do evento, agrupados pelo escopo do relatório que cada um recebe. */
async function destinatariosPorEscopo(): Promise<Map<EscopoRelatorio3dx, string[]>> {
  const pool = await getSqlServerPool();
  const r = await pool.request().query<{ ambiente: Ambiente3dx | null; email: string | null }>(`
    SELECT d.[ambiente], COALESCE(u.[email], d.[email]) AS [email]
    FROM dbo.portal_3dx_plugins_destinatarios d
    LEFT JOIN dbo.portal_usuarios u ON u.[id] = d.[usuario_id]
    WHERE d.[plugin_chave] IS NULL AND d.[evento] = 'relatorio_diario' AND d.[ativo] = 1
      AND (d.[usuario_id] IS NULL OR u.[ativo] = 1);
  `);
  const grupos = new Map<EscopoRelatorio3dx, string[]>();
  for (const linha of r.recordset) {
    const email = linha.email?.trim().toLowerCase();
    if (!email) continue;
    const escopo: EscopoRelatorio3dx = linha.ambiente ?? "AMBOS";
    const lista = grupos.get(escopo) ?? [];
    if (!lista.includes(email)) lista.push(email);
    grupos.set(escopo, lista);
  }
  return grupos;
}

/*
 * Reserva o envio do dia + escopo. Devolve o id do registro se este servidor deve enviar:
 *  - não existe registro -> cria (UNIQUE garante um só, mesmo com dois servidores no mesmo instante);
 *  - falhou (ou ficou "pendente" travado mais de 1 h) e ainda tem tentativa -> retoma após 30 min.
 */
async function reservarEnvio(data: string, escopo: EscopoRelatorio3dx): Promise<string | null> {
  const pool = await getSqlServerPool();
  try {
    const novo = await pool
      .request()
      .input("dia", sql.Date, data)
      .input("escopo", sql.VarChar(10), escopo)
      .query<{ id: string }>(`
        INSERT INTO dbo.portal_3dx_plugins_relatorios ([data_referencia], [escopo])
        OUTPUT CONVERT(VARCHAR(36), inserted.[id]) AS [id]
        SELECT @dia, @escopo
        WHERE NOT EXISTS (SELECT 1 FROM dbo.portal_3dx_plugins_relatorios WITH (UPDLOCK, HOLDLOCK)
                          WHERE [data_referencia] = @dia AND [escopo] = @escopo);
      `);
    if (novo.recordset[0]) return novo.recordset[0].id;
  } catch (erro) {
    /* 2627/2601 = outro servidor reservou no mesmo instante. */
    const numero = (erro as { number?: number }).number;
    if (numero !== 2627 && numero !== 2601) throw erro;
    return null;
  }

  const retomado = await pool
    .request()
    .input("dia", sql.Date, data)
    .input("escopo", sql.VarChar(10), escopo)
    .input("max", sql.Int, MAX_TENTATIVAS)
    .query<{ id: string }>(`
      UPDATE dbo.portal_3dx_plugins_relatorios
      SET [situacao] = 'pendente', [tentativas] = [tentativas] + 1, [atualizado_em] = SYSDATETIME()
      OUTPUT CONVERT(VARCHAR(36), inserted.[id]) AS [id]
      WHERE [data_referencia] = @dia AND [escopo] = @escopo AND [tentativas] < @max
        AND (([situacao] = 'falha' AND [atualizado_em] < DATEADD(MINUTE, -30, SYSDATETIME()))
          OR ([situacao] = 'pendente' AND [atualizado_em] < DATEADD(HOUR, -1, SYSDATETIME())));
    `);
  return retomado.recordset[0]?.id ?? null;
}

async function concluirEnvio(
  id: string,
  emails: string[],
  totalExecucoes: number | null,
  erro: string | null
): Promise<void> {
  const pool = await getSqlServerPool();
  await pool
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .input("situacao", sql.VarChar(10), erro ? "falha" : "enviado")
    .input("destinatarios", sql.NVarChar(sql.MAX), emails.join(", "))
    .input("total", sql.Int, totalExecucoes)
    .input("erro", sql.NVarChar(1000), erro ? erro.slice(0, 1000) : null)
    .query(`
      UPDATE dbo.portal_3dx_plugins_relatorios
      SET [situacao] = @situacao, [destinatarios] = @destinatarios, [total_execucoes] = @total, [erro] = @erro,
        [atualizado_em] = SYSDATETIME()
      WHERE [id] = @id;
    `);
}

export async function processarRelatoriosDiarios(): Promise<void> {
  if (new Date().getHours() < HORA_ENVIO) return;
  const dia = ontem();
  const grupos = await destinatariosPorEscopo();

  for (const [escopo, emails] of grupos) {
    if (emails.length === 0) continue;
    const id = await reservarEnvio(dia, escopo);
    if (!id) continue;
    let total: number | null = null;
    let erro: string | null = null;
    try {
      total = await enviarRelatorio(dia, escopo === "AMBOS" ? null : escopo, emails);
    } catch (e) {
      erro = e instanceof Error ? e.message : String(e);
      console.error(`Erro ao enviar o relatório diário dos Plugins 3DX (${dia}, ${escopo}):`, e);
    }
    await concluirEnvio(id, emails, total, erro);
  }
}

export async function listarEnviosRelatorio(): Promise<EnviosRelatorio3dx> {
  const pool = await getSqlServerPool();
  const r = await pool.request().query<{
    id: string;
    data_referencia: string;
    escopo: EscopoRelatorio3dx;
    situacao: EnvioRelatorio3dx["situacao"];
    tentativas: number;
    destinatarios: string | null;
    total_execucoes: number | null;
    erro: string | null;
    criado_em: string;
    atualizado_em: string;
  }>(`
    SELECT TOP (30) CONVERT(VARCHAR(36), [id]) AS [id], CONVERT(VARCHAR(10), [data_referencia], 23) AS [data_referencia],
      [escopo], [situacao], [tentativas], [destinatarios], [total_execucoes], [erro],
      CONVERT(VARCHAR(33), [criado_em], 126) AS [criado_em], CONVERT(VARCHAR(33), [atualizado_em], 126) AS [atualizado_em]
    FROM dbo.portal_3dx_plugins_relatorios
    ORDER BY [data_referencia] DESC, [escopo];
  `);
  return {
    horaEnvio: HORA_ENVIO,
    envios: r.recordset.map((row) => ({
      id: row.id.toLowerCase(),
      dataReferencia: row.data_referencia,
      escopo: row.escopo,
      situacao: row.situacao,
      tentativas: row.tentativas,
      destinatarios: row.destinatarios ? row.destinatarios.split(", ").filter(Boolean) : [],
      totalExecucoes: row.total_execucoes,
      erro: row.erro,
      criadoEm: row.criado_em,
      atualizadoEm: row.atualizado_em,
    })),
  };
}

export function iniciarAgendadorRelatorioPlugins3dx() {
  if (global.plugins3dxRelatorioAgendadorIniciado) return;
  global.plugins3dxRelatorioAgendadorIniciado = true;

  setInterval(() => {
    if (global.plugins3dxRelatorioVerificando) return;
    global.plugins3dxRelatorioVerificando = true;
    processarRelatoriosDiarios()
      .catch((erro) => {
        /* Sem a migração 0176 a tabela não existe: só registra, não derruba o servidor. */
        console.error("Erro no agendador do relatório diário dos Plugins 3DX:", erro);
      })
      .finally(() => {
        global.plugins3dxRelatorioVerificando = false;
      });
  }, INTERVALO_MS);
}
