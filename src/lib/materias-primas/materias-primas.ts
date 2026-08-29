import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";

const API_BASE_URL_PADRAO = "http://proserver.trielht.com.br:1000";

/*
 * Empresas grandes (ex: TRIEL-HT, cod_emp "2") têm mais de 300
 * páginas de MP (33 mil+ itens) — buscar tudo ao vivo a cada
 * carregamento de tela leva minutos e martela o ERP. Por isso o
 * catálogo é espelhado em `eng_man_materias_primas_cache`
 * (sincronizado manualmente ou pelo agendador, ver
 * src/lib/materias-primas/scheduler.ts) e a busca da tela sempre lê
 * dessa cópia local — instantânea, não bate no ERP a cada tecla.
 */
const LOTE_CONCORRENTE = 10;

/*
 * Sinalizador em memória de "pare assim que possível" — a
 * sincronização em si roda no mesmo processo Node, então basta um
 * Set compartilhado; um cancelamento pedido de qualquer aba/admin
 * é visto pelo loop de busca no ERP entre um lote de páginas e o
 * próximo (não interrompe uma página já em voo, só não pede a
 * próxima leva).
 */
const cancelamentosSolicitados = new Set<string>();

export class SincronizacaoCanceladaError extends Error {
  constructor() {
    super("Sincronização cancelada.");
    this.name = "SincronizacaoCanceladaError";
  }
}

/*
 * Marca a sincronização em andamento de uma empresa pra parar assim
 * que possível, E já encerra o log mais recente como "cancelado" na
 * hora — cobre tanto o caso comum (o loop realmente está rodando
 * neste processo e vai notar a flag) quanto uma linha "em_andamento"
 * órfã (ex: processo reiniciado no meio de uma sincronização
 * anterior, sem ninguém mais ouvindo aquela flag).
 */
export async function cancelarSincronizacao(codEmpresa: string): Promise<boolean> {
  cancelamentosSolicitados.add(codEmpresa);
  return marcarUltimaEmAndamentoComoCancelada(codEmpresa);
}

export interface ItemMateriaPrima {
  codigo: string;
  descricao: string;
  descricaoResumida: string;
  unidadeMedida: string | null;
}

interface ItemErpRow {
  COD_ITEM: string;
  DESC_TECNICA: string | null;
  DESC_RESUM: string | null;
  COD_UNID_MED: string | null;
  SIT_CAPA: string | null;
}

interface RespostaItemErp {
  success: boolean;
  message?: string;
  paginacao?: { totalPaginas: number };
  data: ItemErpRow[];
}

async function buscarPaginaErp(
  apiBaseUrl: string,
  codEmpresa: string,
  pagina: number
): Promise<RespostaItemErp> {
  const url = `${apiBaseUrl}/api/item?cod_emp=${encodeURIComponent(codEmpresa)}&cod_grp_invent=110&page=${pagina}`;
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Erro HTTP ${response.status} ao consultar itens no ERP.`);
  }

  return response.json();
}

function mapearLinhaErp(row: ItemErpRow): ItemMateriaPrima {
  return {
    codigo: row.COD_ITEM,
    descricao: row.DESC_TECNICA ?? row.DESC_RESUM ?? row.COD_ITEM,
    descricaoResumida: row.DESC_RESUM ?? row.DESC_TECNICA ?? row.COD_ITEM,
    unidadeMedida: row.COD_UNID_MED,
  };
}

/*
 * Busca TODAS as MPs (cod_grp_invent=110, filtro fixo) direto do
 * ERP, em lotes concorrentes de páginas — só usada pela
 * sincronização, nunca pela tela em si. Pode levar minutos numa
 * empresa grande.
 */
async function buscarItensMateriaPrimaDoErp(
  apiBaseUrl: string,
  codEmpresa: string
): Promise<ItemMateriaPrima[]> {
  const primeira = await buscarPaginaErp(apiBaseUrl, codEmpresa, 1);

  if (!primeira.success) {
    return [];
  }

  const itens: ItemMateriaPrima[] = primeira.data
    .filter((row) => row.SIT_CAPA === "ATIVO")
    .map(mapearLinhaErp);

  const totalPaginas = primeira.paginacao?.totalPaginas ?? 1;
  const paginasRestantes = Array.from(
    { length: Math.max(0, totalPaginas - 1) },
    (_, indice) => indice + 2
  );

  for (let inicio = 0; inicio < paginasRestantes.length; inicio += LOTE_CONCORRENTE) {
    if (cancelamentosSolicitados.has(codEmpresa)) {
      throw new SincronizacaoCanceladaError();
    }

    const lote = paginasRestantes.slice(inicio, inicio + LOTE_CONCORRENTE);

    const resultados = await Promise.all(
      lote.map((pagina) => buscarPaginaErp(apiBaseUrl, codEmpresa, pagina))
    );

    for (const resultado of resultados) {
      if (!resultado.success) continue;

      for (const row of resultado.data) {
        if (row.SIT_CAPA !== "ATIVO") continue;
        itens.push(mapearLinhaErp(row));
      }
    }
  }

  return itens;
}

/*
 * Sincroniza o catálogo de uma empresa: busca tudo do ERP e
 * substitui o conteúdo da tabela local pra essa empresa (delete +
 * insert, numa transação), registrando o resultado em
 * eng_man_sincronizacao_logs. `disparadoPor` null = disparado pelo
 * agendador automático, não por uma pessoa clicando num botão.
 */
export async function sincronizarCatalogoMateriaPrima(
  codEmpresa: string,
  disparadoPor: string | null
): Promise<{ totalItens: number }> {
  const logId = await registrarInicioSincronizacao(codEmpresa, disparadoPor);

  try {
    const config = await buscarConfigMateriaPrima();
    const itens = await buscarItensMateriaPrimaDoErp(config.apiBaseUrl, codEmpresa);

    const pool = await getSqlServerPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      await new sql.Request(transaction)
        .input("codEmpresa", sql.NVarChar(30), codEmpresa)
        .query(`DELETE FROM dbo.eng_man_materias_primas_cache WHERE [cod_empresa] = @codEmpresa;`);

      for (const item of itens) {
        await new sql.Request(transaction)
          .input("codEmpresa", sql.NVarChar(30), codEmpresa)
          .input("codItem", sql.NVarChar(30), item.codigo)
          .input("descricao", sql.NVarChar(200), item.descricao)
          .input("descricaoResumida", sql.NVarChar(200), item.descricaoResumida)
          .input("unidadeMedida", sql.NVarChar(20), item.unidadeMedida)
          .query(`
            INSERT INTO dbo.eng_man_materias_primas_cache
              ([cod_empresa], [cod_item], [descricao], [descricao_resumida], [unidade_medida])
            VALUES (@codEmpresa, @codItem, @descricao, @descricaoResumida, @unidadeMedida);
          `);
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    await finalizarSincronizacao(logId, { status: "sucesso", totalItens: itens.length });
    return { totalItens: itens.length };
  } catch (error) {
    if (error instanceof SincronizacaoCanceladaError) {
      await finalizarSincronizacao(logId, { status: "cancelado" });
      throw error;
    }

    const mensagem = error instanceof Error ? error.message : "Erro desconhecido.";
    await finalizarSincronizacao(logId, { status: "erro", mensagemErro: mensagem });
    throw error;
  } finally {
    cancelamentosSolicitados.delete(codEmpresa);
  }
}

interface ItemCacheRow {
  cod_item: string;
  descricao: string;
  descricao_resumida: string | null;
  unidade_medida: string | null;
}

/*
 * Leitura rápida do catálogo já sincronizado — é isso que a tela de
 * de-para usa, nunca a busca ao vivo no ERP.
 */
export async function listarItensMateriaPrimaCache(
  codEmpresa: string
): Promise<ItemMateriaPrima[]> {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("codEmpresa", sql.NVarChar(30), codEmpresa)
    .query<ItemCacheRow>(`
      SELECT [cod_item], [descricao], [descricao_resumida], [unidade_medida]
      FROM dbo.eng_man_materias_primas_cache
      WHERE [cod_empresa] = @codEmpresa
      ORDER BY [cod_item];
    `);

  return result.recordset.map((row) => ({
    codigo: row.cod_item,
    descricao: row.descricao,
    descricaoResumida: row.descricao_resumida ?? row.descricao,
    unidadeMedida: row.unidade_medida,
  }));
}

export interface ItensCachePaginados {
  itens: ItemMateriaPrima[];
  totalRegistros: number;
  totalPaginas: number;
}

const ITENS_POR_PAGINA_CACHE = 50;

/*
 * Usada pela tela de admin pra inspecionar o catálogo espelhado de
 * uma empresa a partir do log de sincronização — a tabela cache
 * sempre reflete só a sincronização mais recente daquela empresa
 * (cada sincronização substitui tudo), então "os itens sincronizados"
 * de um log de sucesso mais antigo, se já houve outra sincronização
 * depois, mostra o estado atual, não um retrato histórico daquele
 * log específico (o schema não guarda isso por linha, só o total).
 */
export async function listarItensMateriaPrimaCachePaginado(
  codEmpresa: string,
  params: { pagina?: number; busca?: string } = {}
): Promise<ItensCachePaginados> {
  const pagina = Math.max(1, params.pagina ?? 1);
  const busca = params.busca?.trim() ?? "";

  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("codEmpresa", sql.NVarChar(30), codEmpresa);
  request.input("busca", sql.NVarChar(202), `%${busca}%`);

  const filtroBusca = busca
    ? `AND ([cod_item] LIKE @busca OR [descricao] LIKE @busca OR [descricao_resumida] LIKE @busca)`
    : "";

  const totalResult = await request.query<{ total: number }>(`
    SELECT COUNT(*) AS [total]
    FROM dbo.eng_man_materias_primas_cache
    WHERE [cod_empresa] = @codEmpresa ${filtroBusca};
  `);

  const totalRegistros = totalResult.recordset[0]?.total ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(totalRegistros / ITENS_POR_PAGINA_CACHE));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const offset = (paginaSegura - 1) * ITENS_POR_PAGINA_CACHE;

  const requestPagina = pool.request();
  requestPagina.input("codEmpresa", sql.NVarChar(30), codEmpresa);
  requestPagina.input("busca", sql.NVarChar(202), `%${busca}%`);
  requestPagina.input("offset", sql.Int, offset);
  requestPagina.input("porPagina", sql.Int, ITENS_POR_PAGINA_CACHE);

  const itensResult = await requestPagina.query<ItemCacheRow>(`
    SELECT [cod_item], [descricao], [descricao_resumida], [unidade_medida]
    FROM dbo.eng_man_materias_primas_cache
    WHERE [cod_empresa] = @codEmpresa ${filtroBusca}
    ORDER BY [cod_item]
    OFFSET @offset ROWS FETCH NEXT @porPagina ROWS ONLY;
  `);

  return {
    itens: itensResult.recordset.map((row) => ({
      codigo: row.cod_item,
      descricao: row.descricao,
      descricaoResumida: row.descricao_resumida ?? row.descricao,
      unidadeMedida: row.unidade_medida,
    })),
    totalRegistros,
    totalPaginas,
  };
}

export async function buscarUltimaSincronizacao(codEmpresa: string): Promise<string | null> {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("codEmpresa", sql.NVarChar(30), codEmpresa)
    .query<{ ultima: string | null }>(`
      SELECT CONVERT(VARCHAR(33), MAX([atualizado_em]), 126) AS [ultima]
      FROM dbo.eng_man_materias_primas_cache
      WHERE [cod_empresa] = @codEmpresa;
    `);

  return result.recordset[0]?.ultima ?? null;
}

export interface EmpresaComCatalogo {
  codEmpresa: string;
  totalItens: number;
  ultimaSincronizacao: string | null;
}

/*
 * Empresas que já têm ao menos uma sincronização feita — é a lista
 * usada tanto pelo painel de admin (uma linha "Sincronizar agora"
 * por empresa) quanto pelo agendador automático (reidrata só quem
 * já foi sincronizado alguma vez, nunca dispara uma empresa nova
 * sozinho).
 */
export async function listarEmpresasComCatalogo(): Promise<EmpresaComCatalogo[]> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<{
    cod_empresa: string;
    total_itens: number;
    ultima_sincronizacao: string;
  }>(`
    SELECT
      [cod_empresa],
      COUNT(*) AS [total_itens],
      CONVERT(VARCHAR(33), MAX([atualizado_em]), 126) AS [ultima_sincronizacao]
    FROM dbo.eng_man_materias_primas_cache
    GROUP BY [cod_empresa]
    ORDER BY [cod_empresa];
  `);

  return result.recordset.map((row) => ({
    codEmpresa: row.cod_empresa,
    totalItens: row.total_itens,
    ultimaSincronizacao: row.ultima_sincronizacao,
  }));
}

/* ==================== Configuração ==================== */

export interface ConfigMateriaPrima {
  apiBaseUrl: string;
  intervaloSincronizacaoMinutos: number | null;
  atualizadoEm: string | null;
  atualizadoPor: string | null;
}

interface ConfigRow {
  api_base_url: string;
  intervalo_sincronizacao_minutos: number | null;
  atualizado_em: string;
  atualizado_por: string | null;
}

/*
 * Nunca retorna null: se ninguém configurou ainda, devolve o valor
 * padrão da API (sem sincronização automática) — o resto do código
 * (sincronização, agendador) sempre pode confiar num objeto válido.
 */
export async function buscarConfigMateriaPrima(): Promise<ConfigMateriaPrima> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<ConfigRow>(`
    SELECT [api_base_url], [intervalo_sincronizacao_minutos],
      CONVERT(VARCHAR(33), [atualizado_em], 126) AS [atualizado_em], [atualizado_por]
    FROM dbo.eng_man_config_materia_prima
    WHERE [id] = 1;
  `);

  const row = result.recordset[0];

  if (!row) {
    return {
      apiBaseUrl: API_BASE_URL_PADRAO,
      intervaloSincronizacaoMinutos: null,
      atualizadoEm: null,
      atualizadoPor: null,
    };
  }

  return {
    apiBaseUrl: row.api_base_url,
    intervaloSincronizacaoMinutos: row.intervalo_sincronizacao_minutos,
    atualizadoEm: row.atualizado_em,
    atualizadoPor: row.atualizado_por,
  };
}

export async function salvarConfigMateriaPrima(params: {
  apiBaseUrl: string;
  intervaloSincronizacaoMinutos: number | null;
  atualizadoPor: string;
}): Promise<ConfigMateriaPrima> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("apiBaseUrl", sql.NVarChar(300), params.apiBaseUrl);
  request.input(
    "intervalo",
    sql.Int,
    params.intervaloSincronizacaoMinutos
  );
  request.input("atualizadoPor", sql.NVarChar(150), params.atualizadoPor);

  await request.query(`
    MERGE INTO dbo.eng_man_config_materia_prima AS destino
    USING (SELECT 1 AS [id]) AS origem
      ON destino.[id] = origem.[id]
    WHEN MATCHED THEN
      UPDATE SET
        [api_base_url] = @apiBaseUrl,
        [intervalo_sincronizacao_minutos] = @intervalo,
        [atualizado_em] = SYSDATETIME(),
        [atualizado_por] = @atualizadoPor
    WHEN NOT MATCHED THEN
      INSERT ([id], [api_base_url], [intervalo_sincronizacao_minutos], [atualizado_por])
      VALUES (1, @apiBaseUrl, @intervalo, @atualizadoPor);
  `);

  return buscarConfigMateriaPrima();
}

/* ==================== Logs de sincronização ==================== */

export interface LogSincronizacao {
  id: string;
  codEmpresa: string;
  iniciadoEm: string;
  finalizadoEm: string | null;
  status: "sucesso" | "erro" | "em_andamento" | "cancelado";
  totalItens: number | null;
  mensagemErro: string | null;
  /* null = disparado pelo agendador automático; senão, o sam_account_name de quem clicou. */
  disparadoPor: string | null;
}

interface LogRow {
  id: string;
  cod_empresa: string;
  iniciado_em: string;
  finalizado_em: string | null;
  status: string;
  total_itens: number | null;
  mensagem_erro: string | null;
  disparado_por: string | null;
}

function mapLogRow(row: LogRow): LogSincronizacao {
  return {
    id: row.id,
    codEmpresa: row.cod_empresa,
    iniciadoEm: row.iniciado_em,
    finalizadoEm: row.finalizado_em,
    status: row.status as LogSincronizacao["status"],
    totalItens: row.total_itens,
    mensagemErro: row.mensagem_erro,
    disparadoPor: row.disparado_por,
  };
}

async function registrarInicioSincronizacao(
  codEmpresa: string,
  disparadoPor: string | null
): Promise<string> {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("codEmpresa", sql.NVarChar(30), codEmpresa)
    .input("disparadoPor", sql.NVarChar(150), disparadoPor)
    .query<{ id: string }>(`
      INSERT INTO dbo.eng_man_sincronizacao_logs
        ([cod_empresa], [iniciado_em], [status], [disparado_por])
      OUTPUT CONVERT(VARCHAR(36), INSERTED.[id]) AS [id]
      VALUES (@codEmpresa, SYSDATETIME(), 'em_andamento', @disparadoPor);
    `);

  return result.recordset[0].id;
}

async function finalizarSincronizacao(
  logId: string,
  params:
    | { status: "sucesso"; totalItens: number }
    | { status: "erro"; mensagemErro: string }
    | { status: "cancelado" }
): Promise<void> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("id", sql.UniqueIdentifier, logId);
  request.input("status", sql.NVarChar(20), params.status);
  request.input("totalItens", sql.Int, params.status === "sucesso" ? params.totalItens : null);
  request.input(
    "mensagemErro",
    sql.NVarChar(1000),
    params.status === "erro" ? params.mensagemErro : null
  );

  await request.query(`
    UPDATE dbo.eng_man_sincronizacao_logs
    SET [finalizado_em] = SYSDATETIME(), [status] = @status, [total_itens] = @totalItens, [mensagem_erro] = @mensagemErro
    WHERE [id] = @id;
  `);
}

/*
 * Usada por cancelarSincronizacao — encerra direto no banco a linha
 * "em_andamento" mais recente de uma empresa, mesmo que não haja
 * (mais) nenhum loop neste processo realmente ouvindo a flag de
 * cancelamento (ex: linha órfã de uma sincronização de uma
 * instância anterior do servidor).
 */
async function marcarUltimaEmAndamentoComoCancelada(codEmpresa: string): Promise<boolean> {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("codEmpresa", sql.NVarChar(30), codEmpresa)
    .query(`
      UPDATE TOP (1) dbo.eng_man_sincronizacao_logs
      SET [finalizado_em] = SYSDATETIME(), [status] = 'cancelado'
      WHERE [cod_empresa] = @codEmpresa AND [status] = 'em_andamento';
    `);

  return (result.rowsAffected[0] ?? 0) > 0;
}

export async function listarLogsSincronizacao(limite = 50): Promise<LogSincronizacao[]> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<LogRow>(`
    SELECT TOP (${Number(limite) || 50})
      CONVERT(VARCHAR(36), [id]) AS [id],
      [cod_empresa],
      CONVERT(VARCHAR(33), [iniciado_em], 126) AS [iniciado_em],
      CONVERT(VARCHAR(33), [finalizado_em], 126) AS [finalizado_em],
      [status],
      [total_itens],
      [mensagem_erro],
      [disparado_por]
    FROM dbo.eng_man_sincronizacao_logs
    ORDER BY [iniciado_em] DESC;
  `);

  return result.recordset.map(mapLogRow);
}
