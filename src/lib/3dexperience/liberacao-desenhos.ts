import "server-only";

import { ValidationError } from "@/lib/auth/errors";
import { getSqlServerPool, sql } from "@/lib/database/sql-server";

import {
  achatarEstrutura,
  emTrabalho,
  montarFila,
  type Desenho3DX,
  type NoEstrutura3DX,
} from "./liberacao-regras";

/*
 * 3DExperience → Liberação de desenhos em trabalho.
 *
 * Uma rodada: explode a estrutura do pai no 3DX, busca os desenhos de
 * todos os itens em lote, e libera todo desenho IN_WORK de baixo para
 * cima. Sempre em dois tempos: a SIMULAÇÃO (dryRun, não muda nada no
 * 3DX) e, se a pessoa confirmar, a LIBERAÇÃO real dos desenhos que a
 * simulação apontou. O 3DX é produção: liberar não tem desfazer simples.
 *
 * A API do 3DX (consulta_3dx, proserver:1001) usa uma sessão única: uma
 * rodada por vez no portal inteiro. Tudo vai para o registro
 * (portal_3dx_liberacoes / _desenhos) para análise no período de teste.
 */

/* API_3DX_URL só para apontar a uma instância de teste da API; sem ela, o serviço de sempre. */
const API_3DX = process.env.API_3DX_URL || "http://proserver.trielht.com.br:1001/api/search";
const LOTE_DESENHOS = 300;
/* Rodada parada há mais tempo que isso não bloqueia outra (servidor reiniciado no meio, por exemplo). */
const MINUTOS_RODADA_TRAVADA = 30;

export type StatusRodada = "explodindo" | "buscando_desenhos" | "processando" | "concluida" | "erro";
export type AcaoDesenho = "pendente" | "seria_liberado" | "liberado" | "ja_liberado" | "ignorado" | "erro";

export interface DesenhoDaRodada {
  ordem: number;
  itemCodigo: string | null;
  itemRevisao: string | null;
  itemStatus: string | null;
  itemNivel: number | null;
  desenhoPhysicalId: string;
  desenhoTitulo: string | null;
  desenhoRevisao: string | null;
  statusAntes: string | null;
  acao: AcaoDesenho;
  mensagem: string | null;
}

export interface Rodada {
  id: string;
  codigoPai: string;
  dryRun: boolean;
  simulacaoId: string | null;
  status: StatusRodada;
  totalItens: number | null;
  totalDesenhos: number | null;
  totalEmTrabalho: number | null;
  totalLiberados: number | null;
  totalErros: number | null;
  mensagem: string | null;
  usuarioNome: string;
  criadoEm: string;
  finalizadoEm: string | null;
  /* Se já existe uma liberação real feita a partir desta simulação. */
  liberacaoId: string | null;
}

/* ------------------------------------------------------------------ API 3DX */

async function chamar3dx<T>(caminho: string, init?: RequestInit, timeoutMs = 600_000): Promise<T> {
  const resposta = await fetch(`${API_3DX}${caminho}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = (await resposta.json().catch(() => null)) as (T & { message?: string; error?: string }) | null;
  if (!resposta.ok || !json) {
    throw new Error(json?.message || json?.error || `A API do 3DX respondeu ${resposta.status} em ${caminho}.`);
  }
  return json;
}

async function explodirEstrutura(codigo: string): Promise<NoEstrutura3DX> {
  const json = await chamar3dx<{ success?: boolean; data?: { tree?: NoEstrutura3DX } }>(
    `/structure/${encodeURIComponent(codigo)}`
  );
  if (!json.data?.tree) throw new Error(`O 3DX não devolveu a estrutura de ${codigo}.`);
  return json.data.tree;
}

async function buscarDesenhosEmLote(physicalIds: string[]): Promise<{ desenhos: Map<string, Desenho3DX[]>; erros: string[] }> {
  const desenhos = new Map<string, Desenho3DX[]>();
  const erros: string[] = [];

  for (let inicio = 0; inicio < physicalIds.length; inicio += LOTE_DESENHOS) {
    const json = await chamar3dx<{
      resultados?: { physicalId: string; desenhos?: Desenho3DX[]; erro?: string | null }[];
    }>("/desenhos/lote", { method: "POST", body: JSON.stringify({ physicalIds: physicalIds.slice(inicio, inicio + LOTE_DESENHOS) }) });

    for (const r of json.resultados ?? []) {
      desenhos.set(r.physicalId, r.desenhos ?? []);
      if (r.erro) erros.push(`${r.physicalId}: ${r.erro}`);
    }
  }

  return { desenhos, erros };
}

interface ResultadoJob {
  status: "running" | "done" | "error";
  resultados?: {
    physicalId: string;
    statusAntes?: string | null;
    acao?: string;
    mensagem?: string | null;
    resultado3DX?: unknown;
  }[];
  message?: string;
}

async function iniciarJobLiberacao(desenhos: Desenho3DX[], dryRun: boolean): Promise<string> {
  const json = await chamar3dx<{ jobId?: string }>("/desenhos/liberar/lote", {
    method: "POST",
    body: JSON.stringify({
      dryRun,
      desenhos: desenhos.map(({ physicalId, titulo, tipo, revisao, policy }) => ({ physicalId, titulo, tipo, revisao, policy })),
    }),
  });
  if (!json.jobId) throw new Error("A API do 3DX não devolveu o job da liberação.");
  return json.jobId;
}

async function consultarJob(jobId: string): Promise<ResultadoJob> {
  return chamar3dx<ResultadoJob>(`/desenhos/liberar/job/${encodeURIComponent(jobId)}`, undefined, 30_000);
}

/* ------------------------------------------------------------------ registro */

async function atualizarRodada(id: string, campos: Partial<Record<string, string | number | null>>, finalizar = false) {
  const pool = await getSqlServerPool();
  const request = pool.request().input("id", sql.UniqueIdentifier, id);
  const sets: string[] = [];
  for (const [coluna, valor] of Object.entries(campos)) {
    request.input(coluna, typeof valor === "number" ? sql.Int : sql.NVarChar(2000), valor);
    sets.push(`[${coluna}] = @${coluna}`);
  }
  if (finalizar) sets.push("[finalizado_em] = SYSDATETIME()");
  await request.query(`UPDATE dbo.portal_3dx_liberacoes SET ${sets.join(", ")} WHERE [id] = @id;`);
}

async function falhar(id: string, erro: unknown) {
  const mensagem = erro instanceof Error ? erro.message : String(erro);
  await atualizarRodada(id, { status: "erro", mensagem: mensagem.slice(0, 2000) }, true).catch(() => {});
}

/* Uma rodada por vez no portal inteiro (a sessão do 3DX é única). */
async function garantirNenhumaEmAndamento() {
  const pool = await getSqlServerPool();
  const result = await pool.request().input("minutos", sql.Int, MINUTOS_RODADA_TRAVADA).query<{ codigo_pai: string; usuario_nome: string }>(`
    SELECT TOP 1 [codigo_pai], [usuario_nome] FROM dbo.portal_3dx_liberacoes
    WHERE [status] IN ('explodindo', 'buscando_desenhos', 'processando')
      AND [criado_em] > DATEADD(MINUTE, -@minutos, SYSDATETIME());
  `);
  const ativa = result.recordset[0];
  if (ativa) {
    throw new ValidationError(
      `Já há uma rodada em andamento (${ativa.codigo_pai}, por ${ativa.usuario_nome}). O 3DX atende uma por vez — aguarde ela terminar.`
    );
  }
}

async function criarRodada(params: {
  codigoPai: string;
  dryRun: boolean;
  simulacaoId?: string | null;
  status: StatusRodada;
  usuario: { id: string; nomeExibicao: string };
}): Promise<string> {
  const pool = await getSqlServerPool();
  const result = await pool
    .request()
    .input("codigoPai", sql.NVarChar(50), params.codigoPai)
    .input("dryRun", sql.Bit, params.dryRun)
    .input("simulacaoId", sql.UniqueIdentifier, params.simulacaoId ?? null)
    .input("status", sql.VarChar(20), params.status)
    .input("usuarioId", sql.UniqueIdentifier, params.usuario.id)
    .input("usuarioNome", sql.NVarChar(200), params.usuario.nomeExibicao)
    .query<{ id: string }>(`
      INSERT INTO dbo.portal_3dx_liberacoes ([codigo_pai], [dry_run], [simulacao_id], [status], [usuario_id], [usuario_nome])
      OUTPUT CONVERT(VARCHAR(36), INSERTED.[id]) AS [id]
      VALUES (@codigoPai, @dryRun, @simulacaoId, @status, @usuarioId, @usuarioNome);
    `);
  return result.recordset[0].id;
}

async function gravarDesenhos(
  rodadaId: string,
  linhas: {
    itemCodigo: string | null;
    itemPhysicalId: string | null;
    itemRevisao: string | null;
    itemStatus: string | null;
    itemNivel: number | null;
    desenho: Desenho3DX;
    acao: AcaoDesenho;
    mensagem?: string | null;
  }[]
) {
  const pool = await getSqlServerPool();
  for (const [ordem, l] of linhas.entries()) {
    await pool
      .request()
      .input("liberacaoId", sql.UniqueIdentifier, rodadaId)
      .input("ordem", sql.Int, ordem + 1)
      .input("itemCodigo", sql.NVarChar(50), l.itemCodigo)
      .input("itemPhysicalId", sql.VarChar(64), l.itemPhysicalId)
      .input("itemRevisao", sql.NVarChar(20), l.itemRevisao)
      .input("itemStatus", sql.NVarChar(40), l.itemStatus)
      .input("itemNivel", sql.Int, l.itemNivel)
      .input("desenhoPhysicalId", sql.VarChar(64), l.desenho.physicalId)
      .input("desenhoTitulo", sql.NVarChar(300), l.desenho.titulo ?? null)
      .input("desenhoRevisao", sql.NVarChar(20), l.desenho.revisao ?? null)
      .input("statusAntes", sql.NVarChar(40), l.desenho.status ?? null)
      .input("acao", sql.VarChar(20), l.acao)
      .input("mensagem", sql.NVarChar(2000), l.mensagem ?? null)
      .query(`
        INSERT INTO dbo.portal_3dx_liberacoes_desenhos
          ([liberacao_id], [ordem], [item_codigo], [item_physical_id], [item_revisao], [item_status], [item_nivel],
           [desenho_physical_id], [desenho_titulo], [desenho_revisao], [status_antes], [acao], [mensagem])
        VALUES (@liberacaoId, @ordem, @itemCodigo, @itemPhysicalId, @itemRevisao, @itemStatus, @itemNivel,
                @desenhoPhysicalId, @desenhoTitulo, @desenhoRevisao, @statusAntes, @acao, @mensagem);
      `);
  }
}

/* ------------------------------------------------------------------ fluxo */

/*
 * Começa a SIMULAÇÃO de um pai: grava a rodada e devolve o id na hora;
 * o trabalho pesado (explosão, desenhos, job) roda depois da resposta,
 * via executarSimulacao (a rota chama com after()).
 */
export async function iniciarSimulacao(codigoPai: string, usuario: { id: string; nomeExibicao: string }) {
  await garantirNenhumaEmAndamento();
  return criarRodada({ codigoPai, dryRun: true, status: "explodindo", usuario });
}

export async function executarSimulacao(rodadaId: string, codigoPai: string) {
  try {
    const itens = achatarEstrutura(await explodirEstrutura(codigoPai));
    await atualizarRodada(rodadaId, { status: "buscando_desenhos", total_itens: itens.length });

    const { desenhos, erros } = await buscarDesenhosEmLote(itens.map((i) => i.physicalId));
    const fila = montarFila(itens, desenhos);
    const paraLiberar = fila.filter((f) => emTrabalho(f.desenho));

    /* Todo desenho entra no registro; os em trabalho esperam o job, os demais já ficam como estão. */
    await gravarDesenhos(
      rodadaId,
      fila.map((f) => ({
        itemCodigo: f.item.codigo,
        itemPhysicalId: f.item.physicalId,
        itemRevisao: f.item.revisao,
        itemStatus: f.item.status,
        itemNivel: f.item.nivel,
        desenho: f.desenho,
        acao: emTrabalho(f.desenho) ? "pendente" : (f.desenho.status ?? "").toUpperCase() === "RELEASED" ? "ja_liberado" : "ignorado",
      }))
    );

    await atualizarRodada(rodadaId, {
      total_desenhos: fila.length,
      total_em_trabalho: paraLiberar.length,
      mensagem: erros.length ? `Itens com erro na busca de desenhos: ${erros.join("; ")}`.slice(0, 2000) : null,
    });

    if (paraLiberar.length === 0) {
      await atualizarRodada(rodadaId, { status: "concluida", total_liberados: 0, total_erros: 0 }, true);
      return;
    }

    const jobId = await iniciarJobLiberacao(paraLiberar.map((f) => f.desenho), true);
    await atualizarRodada(rodadaId, { status: "processando", job_id: jobId });
  } catch (erro) {
    await falhar(rodadaId, erro);
  }
}

/*
 * LIBERAÇÃO real a partir de uma simulação concluída: só os desenhos que
 * ela apontou como "seria liberado", na mesma ordem (de baixo para cima).
 */
export async function iniciarLiberacao(simulacaoId: string, usuario: { id: string; nomeExibicao: string }) {
  const simulacao = await buscarRodada(simulacaoId);
  if (!simulacao || !simulacao.rodada.dryRun) throw new ValidationError("Simulação não encontrada.");
  if (simulacao.rodada.status !== "concluida") throw new ValidationError("A simulação ainda não terminou.");
  if (simulacao.rodada.liberacaoId) throw new ValidationError("Esta simulação já foi liberada.");

  const alvo = simulacao.desenhos.filter((d) => d.acao === "seria_liberado");
  if (alvo.length === 0) throw new ValidationError("A simulação não apontou nenhum desenho para liberar.");

  await garantirNenhumaEmAndamento();
  const rodadaId = await criarRodada({
    codigoPai: simulacao.rodada.codigoPai,
    dryRun: false,
    simulacaoId,
    status: "processando",
    usuario,
  });

  await gravarDesenhos(
    rodadaId,
    alvo.map((d) => ({
      itemCodigo: d.itemCodigo,
      itemPhysicalId: null,
      itemRevisao: d.itemRevisao,
      itemStatus: d.itemStatus,
      itemNivel: d.itemNivel,
      desenho: { physicalId: d.desenhoPhysicalId, titulo: d.desenhoTitulo, revisao: d.desenhoRevisao, status: d.statusAntes },
      acao: "pendente",
    }))
  );
  await atualizarRodada(rodadaId, { total_itens: simulacao.rodada.totalItens, total_desenhos: alvo.length, total_em_trabalho: alvo.length });

  try {
    const jobId = await iniciarJobLiberacao(
      alvo.map((d) => ({ physicalId: d.desenhoPhysicalId, titulo: d.desenhoTitulo, revisao: d.desenhoRevisao })),
      false
    );
    await atualizarRodada(rodadaId, { job_id: jobId });
  } catch (erro) {
    await falhar(rodadaId, erro);
  }

  return rodadaId;
}

const ACOES_DO_JOB: Record<string, AcaoDesenho> = {
  liberado: "liberado",
  seria_liberado: "seria_liberado",
  ja_liberado: "ja_liberado",
  ignorado: "ignorado",
  erro: "erro",
};

/*
 * Rodada em processamento: pergunta ao 3DX como está o job e, quando
 * termina, grava o resultado de cada desenho no registro. A tela chama
 * isso a cada poucos segundos (via buscarRodada).
 */
async function acompanharJob(rodadaId: string, jobId: string) {
  let job: ResultadoJob;
  try {
    job = await consultarJob(jobId);
  } catch (erro) {
    /* O 3DX não respondeu agora: tenta de novo na próxima consulta, sem derrubar a rodada. */
    console.error("Erro ao consultar o job de liberação no 3DX:", erro);
    return;
  }

  if (job.status === "running") return;
  if (job.status === "error") {
    await falhar(rodadaId, new Error(job.message || "O job de liberação falhou no 3DX."));
    return;
  }

  const pool = await getSqlServerPool();
  for (const r of job.resultados ?? []) {
    await pool
      .request()
      .input("liberacaoId", sql.UniqueIdentifier, rodadaId)
      .input("desenho", sql.VarChar(64), r.physicalId)
      .input("acao", sql.VarChar(20), ACOES_DO_JOB[r.acao ?? ""] ?? "erro")
      .input("statusAntes", sql.NVarChar(40), r.statusAntes ?? null)
      .input("mensagem", sql.NVarChar(2000), r.mensagem ? String(r.mensagem).slice(0, 2000) : null)
      .input("resultado", sql.NVarChar(sql.MAX), r.resultado3DX === undefined ? null : JSON.stringify(r.resultado3DX))
      .query(`
        UPDATE dbo.portal_3dx_liberacoes_desenhos
        SET [acao] = @acao, [status_antes] = COALESCE(@statusAntes, [status_antes]), [mensagem] = @mensagem, [resultado_3dx] = @resultado
        WHERE [liberacao_id] = @liberacaoId AND [desenho_physical_id] = @desenho AND [acao] = 'pendente';
      `);
  }

  /* O que o job não devolveu fica como erro: nada some do registro. */
  await pool
    .request()
    .input("liberacaoId", sql.UniqueIdentifier, rodadaId)
    .query(`
      UPDATE dbo.portal_3dx_liberacoes_desenhos
      SET [acao] = 'erro', [mensagem] = N'O 3DX não devolveu resultado para este desenho.'
      WHERE [liberacao_id] = @liberacaoId AND [acao] = 'pendente';
    `);

  const totais = await pool.request().input("liberacaoId", sql.UniqueIdentifier, rodadaId).query<{ liberados: number; erros: number }>(`
    SELECT SUM(CASE WHEN [acao] IN ('liberado', 'seria_liberado') THEN 1 ELSE 0 END) AS [liberados],
           SUM(CASE WHEN [acao] = 'erro' THEN 1 ELSE 0 END) AS [erros]
    FROM dbo.portal_3dx_liberacoes_desenhos WHERE [liberacao_id] = @liberacaoId;
  `);
  await atualizarRodada(
    rodadaId,
    { status: "concluida", total_liberados: totais.recordset[0]?.liberados ?? 0, total_erros: totais.recordset[0]?.erros ?? 0 },
    true
  );
}

/* ------------------------------------------------------------------ leitura */

const COLUNAS_RODADA = `
  CONVERT(VARCHAR(36), r.[id]) AS [id], r.[codigo_pai], r.[dry_run], CONVERT(VARCHAR(36), r.[simulacao_id]) AS [simulacao_id],
  r.[status], r.[job_id], r.[total_itens], r.[total_desenhos], r.[total_em_trabalho], r.[total_liberados], r.[total_erros],
  r.[mensagem], r.[usuario_nome], CONVERT(VARCHAR(33), r.[criado_em], 126) AS [criado_em],
  CONVERT(VARCHAR(33), r.[finalizado_em], 126) AS [finalizado_em],
  (SELECT TOP 1 CONVERT(VARCHAR(36), l.[id]) FROM dbo.portal_3dx_liberacoes AS l WHERE l.[simulacao_id] = r.[id]) AS [liberacao_id]`;

interface LinhaRodada {
  id: string;
  codigo_pai: string;
  dry_run: boolean;
  simulacao_id: string | null;
  status: StatusRodada;
  job_id: string | null;
  total_itens: number | null;
  total_desenhos: number | null;
  total_em_trabalho: number | null;
  total_liberados: number | null;
  total_erros: number | null;
  mensagem: string | null;
  usuario_nome: string;
  criado_em: string;
  finalizado_em: string | null;
  liberacao_id: string | null;
}

function paraRodada(l: LinhaRodada): Rodada {
  return {
    id: l.id,
    codigoPai: l.codigo_pai,
    dryRun: Boolean(l.dry_run),
    simulacaoId: l.simulacao_id,
    status: l.status,
    totalItens: l.total_itens,
    totalDesenhos: l.total_desenhos,
    totalEmTrabalho: l.total_em_trabalho,
    totalLiberados: l.total_liberados,
    totalErros: l.total_erros,
    mensagem: l.mensagem,
    usuarioNome: l.usuario_nome,
    criadoEm: l.criado_em,
    finalizadoEm: l.finalizado_em,
    liberacaoId: l.liberacao_id,
  };
}

export async function buscarRodada(id: string): Promise<{ rodada: Rodada; desenhos: DesenhoDaRodada[] } | null> {
  const pool = await getSqlServerPool();
  const ler = () =>
    pool.request().input("id", sql.UniqueIdentifier, id).query<LinhaRodada>(`SELECT ${COLUNAS_RODADA} FROM dbo.portal_3dx_liberacoes AS r WHERE r.[id] = @id;`);

  let linha = (await ler()).recordset[0];
  if (!linha) return null;

  if (linha.status === "processando" && linha.job_id) {
    await acompanharJob(id, linha.job_id);
    linha = (await ler()).recordset[0];
  }

  const desenhos = await pool.request().input("id", sql.UniqueIdentifier, id).query<{
    ordem: number;
    item_codigo: string | null;
    item_revisao: string | null;
    item_status: string | null;
    item_nivel: number | null;
    desenho_physical_id: string;
    desenho_titulo: string | null;
    desenho_revisao: string | null;
    status_antes: string | null;
    acao: AcaoDesenho;
    mensagem: string | null;
  }>(`
    SELECT [ordem], [item_codigo], [item_revisao], [item_status], [item_nivel], [desenho_physical_id], [desenho_titulo],
           [desenho_revisao], [status_antes], [acao], [mensagem]
    FROM dbo.portal_3dx_liberacoes_desenhos WHERE [liberacao_id] = @id ORDER BY [ordem];
  `);

  return {
    rodada: paraRodada(linha),
    desenhos: desenhos.recordset.map((d) => ({
      ordem: d.ordem,
      itemCodigo: d.item_codigo,
      itemRevisao: d.item_revisao,
      itemStatus: d.item_status,
      itemNivel: d.item_nivel,
      desenhoPhysicalId: d.desenho_physical_id,
      desenhoTitulo: d.desenho_titulo,
      desenhoRevisao: d.desenho_revisao,
      statusAntes: d.status_antes,
      acao: d.acao,
      mensagem: d.mensagem,
    })),
  };
}

export async function listarRodadas(limite = 30): Promise<Rodada[]> {
  const pool = await getSqlServerPool();
  const result = await pool
    .request()
    .input("limite", sql.Int, limite)
    .query<LinhaRodada>(`SELECT TOP (@limite) ${COLUNAS_RODADA} FROM dbo.portal_3dx_liberacoes AS r ORDER BY r.[criado_em] DESC;`);
  return result.recordset.map(paraRodada);
}
