import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";

import { colunasSql } from "./sql";

/*
 * Rotas avulsas (ver catalogo.ts): configuração de cada rota, tokens de
 * acesso e o log de toda requisição recebida.
 *
 * Tokens: "pta_" + 32 bytes aleatórios em base64url. Só o SHA-256 vai pro
 * banco; o token em si é devolvido uma única vez, na criação. A busca na
 * autenticação é pelo hash (índice único), então não há comparação de
 * segredo em texto que pudesse vazar por diferença de tempo.
 */

export type ResultadoLogRotaAvulsa = "aceito" | "recusado" | "erro";
export type SituacaoToken = "ativo" | "expirado" | "revogado";

export interface ConfigRotaAvulsa {
  chave: string;
  ativo: boolean;
  limitePorSegundo: number;
  rajada: number;
  limitePorMinuto: number;
  /* Configuração específica da rota (JSON livre, validado por quem usa). */
  config: Record<string, unknown>;
  atualizadoEm: string | null;
  atualizadoPor: string | null;
}

/* Restrições do token além da rota (impressão: impressoras liberadas; vazio = todas). */
export interface EscopoToken {
  impressoras?: string[];
}

export interface TokenRotaAvulsa {
  id: string;
  rotaChave: string;
  nome: string;
  prefixo: string;
  escopo: EscopoToken;
  expiraEm: string | null;
  revogadoEm: string | null;
  revogadoPor: string | null;
  ultimoUsoEm: string | null;
  ultimoIp: string | null;
  totalUsos: number;
  criadoEm: string;
  criadoPor: string;
  situacao: SituacaoToken;
}

export interface LogRotaAvulsa {
  id: string;
  rotaChave: string;
  tokenId: string | null;
  tokenNome: string | null;
  ipOrigem: string | null;
  metodo: string;
  caminho: string;
  statusHttp: number;
  resultado: ResultadoLogRotaAvulsa;
  motivo: string | null;
  detalhes: unknown;
  duracaoMs: number | null;
  criadoEm: string;
}

export interface ResumoLogsRotaAvulsa {
  aceitos: number;
  recusados: number;
  erros: number;
}

const PREFIXO_TOKEN = "pta_";
const FORMATO_TOKEN = /^pta_[A-Za-z0-9_-]{43}$/;

function lerJson<T>(texto: string | null, padrao: T): T {
  if (!texto) return padrao;
  try {
    const valor: unknown = JSON.parse(texto);
    return (valor && typeof valor === "object" ? valor : padrao) as T;
  } catch {
    return padrao;
  }
}

function iso(data: Date | null): string | null {
  return data ? data.toISOString() : null;
}

export function hashToken(token: string): Buffer {
  return createHash("sha256").update(token, "utf8").digest();
}

/* Formato conferido antes de ir ao banco: lixo no cabeçalho nem gera consulta. */
export function tokenTemFormatoValido(token: string): boolean {
  return FORMATO_TOKEN.test(token);
}

/* ---------- configuração da rota ---------- */

interface RotaRow {
  chave: string;
  ativo: boolean;
  limite_por_segundo: number;
  rajada: number;
  limite_por_minuto: number;
  config: string | null;
  atualizado_em: Date | null;
  atualizado_por: string | null;
}

function mapearRota(row: RotaRow): ConfigRotaAvulsa {
  return {
    chave: row.chave,
    ativo: row.ativo,
    limitePorSegundo: row.limite_por_segundo,
    rajada: row.rajada,
    limitePorMinuto: row.limite_por_minuto,
    config: lerJson<Record<string, unknown>>(row.config, {}),
    atualizadoEm: iso(row.atualizado_em),
    atualizadoPor: row.atualizado_por,
  };
}

const LISTA_ROTA = ["chave", "ativo", "limite_por_segundo", "rajada", "limite_por_minuto", "config", "atualizado_em", "atualizado_por"];
const COLUNAS_ROTA = colunasSql(LISTA_ROTA, ["atualizado_em"]);
const COLUNAS_ROTA_INSERTED = colunasSql(LISTA_ROTA, ["atualizado_em"], "INSERTED.");

export async function buscarConfigRotaAvulsa(chave: string): Promise<ConfigRotaAvulsa | null> {
  const pool = await getSqlServerPool();
  const resultado = await pool
    .request()
    .input("chave", sql.VarChar(60), chave)
    .query<RotaRow>(`SELECT ${COLUNAS_ROTA} FROM dbo.portal_rotas_avulsas WHERE [chave] = @chave;`);
  const row = resultado.recordset[0];
  return row ? mapearRota(row) : null;
}

export async function salvarConfigRotaAvulsa(dados: {
  chave: string;
  ativo: boolean;
  limitePorSegundo: number;
  rajada: number;
  limitePorMinuto: number;
  config: Record<string, unknown>;
  atualizadoPor: string;
}): Promise<ConfigRotaAvulsa | null> {
  const pool = await getSqlServerPool();
  const resultado = await pool
    .request()
    .input("chave", sql.VarChar(60), dados.chave)
    .input("ativo", sql.Bit, dados.ativo)
    .input("seg", sql.Int, dados.limitePorSegundo)
    .input("rajada", sql.Int, dados.rajada)
    .input("min", sql.Int, dados.limitePorMinuto)
    .input("config", sql.NVarChar(sql.MAX), JSON.stringify(dados.config))
    .input("por", sql.NVarChar(100), dados.atualizadoPor)
    .query<RotaRow>(`
      UPDATE dbo.portal_rotas_avulsas
      SET [ativo] = @ativo, [limite_por_segundo] = @seg, [rajada] = @rajada, [limite_por_minuto] = @min,
          [config] = @config, [atualizado_em] = SYSDATETIME(), [atualizado_por] = @por
      OUTPUT ${COLUNAS_ROTA_INSERTED}
      WHERE [chave] = @chave;
    `);
  const row = resultado.recordset[0];
  return row ? mapearRota(row) : null;
}

/* ---------- tokens ---------- */

interface TokenRow {
  id: string;
  rota_chave: string;
  nome: string;
  prefixo: string;
  escopo: string | null;
  expira_em: Date | null;
  revogado_em: Date | null;
  revogado_por: string | null;
  ultimo_uso_em: Date | null;
  ultimo_ip: string | null;
  total_usos: number;
  criado_em: Date;
  criado_por: string;
}

const LISTA_TOKEN = [
  "id", "rota_chave", "nome", "prefixo", "escopo", "expira_em", "revogado_em", "revogado_por",
  "ultimo_uso_em", "ultimo_ip", "total_usos", "criado_em", "criado_por",
];
const DATAS_TOKEN = ["expira_em", "revogado_em", "ultimo_uso_em", "criado_em"];
const COLUNAS_TOKEN = colunasSql(LISTA_TOKEN, DATAS_TOKEN);
const COLUNAS_TOKEN_INSERTED = colunasSql(LISTA_TOKEN, DATAS_TOKEN, "INSERTED.");

const FIM_DO_DIA = "DATEADD(SECOND, -1, DATEADD(DAY, 1, CAST(@expira AS DATETIME2)))";

export function situacaoDoToken(
  token: { revogadoEm: string | null; expiraEm: string | null },
  agora = new Date()
): SituacaoToken {
  if (token.revogadoEm) return "revogado";
  if (token.expiraEm && new Date(token.expiraEm) <= agora) return "expirado";
  return "ativo";
}

function mapearToken(row: TokenRow): TokenRotaAvulsa {
  const base = {
    id: row.id,
    rotaChave: row.rota_chave,
    nome: row.nome,
    prefixo: row.prefixo,
    escopo: lerJson<EscopoToken>(row.escopo, {}),
    expiraEm: iso(row.expira_em),
    revogadoEm: iso(row.revogado_em),
    revogadoPor: row.revogado_por,
    ultimoUsoEm: iso(row.ultimo_uso_em),
    ultimoIp: row.ultimo_ip,
    totalUsos: row.total_usos,
    criadoEm: row.criado_em.toISOString(),
    criadoPor: row.criado_por,
  };
  return { ...base, situacao: situacaoDoToken(base) };
}

export async function listarTokensRotaAvulsa(rotaChave: string): Promise<TokenRotaAvulsa[]> {
  const pool = await getSqlServerPool();
  const resultado = await pool
    .request()
    .input("rota", sql.VarChar(60), rotaChave)
    .query<TokenRow>(`
      SELECT ${COLUNAS_TOKEN} FROM dbo.portal_rotas_avulsas_tokens
      WHERE [rota_chave] = @rota
      ORDER BY CASE WHEN [revogado_em] IS NULL THEN 0 ELSE 1 END, [criado_em] DESC;
    `);
  return resultado.recordset.map(mapearToken);
}

/* Cria o token e devolve o valor em texto, que não é guardado em lugar nenhum. */
export async function criarTokenRotaAvulsa(dados: {
  rotaChave: string;
  nome: string;
  escopo: EscopoToken;
  /* Data AAAA-MM-DD: vale até 23:59:59 desse dia, no horário do servidor. */
  expiraEm: string | null;
  criadoPor: string;
}): Promise<{ token: TokenRotaAvulsa; valor: string }> {
  const valor = PREFIXO_TOKEN + randomBytes(32).toString("base64url");
  const pool = await getSqlServerPool();
  const resultado = await pool
    .request()
    .input("rota", sql.VarChar(60), dados.rotaChave)
    .input("nome", sql.NVarChar(120), dados.nome)
    .input("prefixo", sql.VarChar(20), valor.slice(0, 12))
    .input("hash", sql.VarBinary(32), hashToken(valor))
    .input("escopo", sql.NVarChar(sql.MAX), JSON.stringify(dados.escopo))
    .input("expira", sql.VarChar(10), dados.expiraEm)
    .input("por", sql.NVarChar(100), dados.criadoPor)
    .query<TokenRow>(`
      INSERT INTO dbo.portal_rotas_avulsas_tokens ([rota_chave], [nome], [prefixo], [token_hash], [escopo], [expira_em], [criado_por])
      OUTPUT ${COLUNAS_TOKEN_INSERTED}
      VALUES (@rota, @nome, @prefixo, @hash, @escopo, ${FIM_DO_DIA}, @por);
    `);
  return { token: mapearToken(resultado.recordset[0]), valor };
}

export async function atualizarTokenRotaAvulsa(dados: {
  rotaChave: string;
  id: string;
  nome: string;
  escopo: EscopoToken;
  expiraEm: string | null;
}): Promise<TokenRotaAvulsa | null> {
  const pool = await getSqlServerPool();
  const resultado = await pool
    .request()
    .input("rota", sql.VarChar(60), dados.rotaChave)
    .input("id", sql.UniqueIdentifier, dados.id)
    .input("nome", sql.NVarChar(120), dados.nome)
    .input("escopo", sql.NVarChar(sql.MAX), JSON.stringify(dados.escopo))
    .input("expira", sql.VarChar(10), dados.expiraEm)
    .query<TokenRow>(`
      UPDATE dbo.portal_rotas_avulsas_tokens
      SET [nome] = @nome, [escopo] = @escopo, [expira_em] = ${FIM_DO_DIA}
      OUTPUT ${COLUNAS_TOKEN_INSERTED}
      WHERE [id] = @id AND [rota_chave] = @rota AND [revogado_em] IS NULL;
    `);
  const row = resultado.recordset[0];
  return row ? mapearToken(row) : null;
}

/* Revogação é definitiva: o token não volta a valer; para reativar, cria-se outro. */
export async function revogarTokenRotaAvulsa(
  rotaChave: string,
  id: string,
  revogadoPor: string
): Promise<TokenRotaAvulsa | null> {
  const pool = await getSqlServerPool();
  const resultado = await pool
    .request()
    .input("rota", sql.VarChar(60), rotaChave)
    .input("id", sql.UniqueIdentifier, id)
    .input("por", sql.NVarChar(100), revogadoPor)
    .query<TokenRow>(`
      UPDATE dbo.portal_rotas_avulsas_tokens
      SET [revogado_em] = SYSDATETIME(), [revogado_por] = @por
      OUTPUT ${COLUNAS_TOKEN_INSERTED}
      WHERE [id] = @id AND [rota_chave] = @rota AND [revogado_em] IS NULL;
    `);
  const row = resultado.recordset[0];
  return row ? mapearToken(row) : null;
}

export async function buscarTokenPorValor(valor: string): Promise<TokenRotaAvulsa | null> {
  const pool = await getSqlServerPool();
  const resultado = await pool
    .request()
    .input("hash", sql.VarBinary(32), hashToken(valor))
    .query<TokenRow>(`SELECT ${COLUNAS_TOKEN} FROM dbo.portal_rotas_avulsas_tokens WHERE [token_hash] = @hash;`);
  const row = resultado.recordset[0];
  return row ? mapearToken(row) : null;
}

export async function registrarUsoToken(id: string, ip: string | null): Promise<void> {
  const pool = await getSqlServerPool();
  await pool
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .input("ip", sql.VarChar(64), ip)
    .query(`
      UPDATE dbo.portal_rotas_avulsas_tokens
      SET [ultimo_uso_em] = SYSDATETIME(), [ultimo_ip] = @ip, [total_usos] = [total_usos] + 1
      WHERE [id] = @id;
    `);
}

/* ---------- logs ---------- */

/* Nunca lança: falhar ao gravar o log não pode derrubar a resposta. */
export async function registrarLogRotaAvulsa(dados: {
  rotaChave: string;
  tokenId: string | null;
  tokenNome: string | null;
  ipOrigem: string | null;
  metodo: string;
  caminho: string;
  statusHttp: number;
  resultado: ResultadoLogRotaAvulsa;
  motivo: string | null;
  detalhes?: unknown;
  duracaoMs: number | null;
}): Promise<void> {
  try {
    const pool = await getSqlServerPool();
    await pool
      .request()
      .input("rota", sql.VarChar(60), dados.rotaChave)
      .input("tokenId", sql.UniqueIdentifier, dados.tokenId)
      .input("tokenNome", sql.NVarChar(120), dados.tokenNome)
      .input("ip", sql.VarChar(64), dados.ipOrigem)
      .input("metodo", sql.VarChar(10), dados.metodo.slice(0, 10))
      .input("caminho", sql.NVarChar(300), dados.caminho.slice(0, 300))
      .input("status", sql.Int, dados.statusHttp)
      .input("resultado", sql.VarChar(20), dados.resultado)
      .input("motivo", sql.NVarChar(400), dados.motivo?.slice(0, 400) ?? null)
      .input("detalhes", sql.NVarChar(sql.MAX), dados.detalhes === undefined ? null : JSON.stringify(dados.detalhes))
      .input("duracao", sql.Int, dados.duracaoMs)
      .query(`
        INSERT INTO dbo.portal_rotas_avulsas_logs
          ([rota_chave], [token_id], [token_nome], [ip_origem], [metodo], [caminho], [status_http], [resultado], [motivo], [detalhes], [duracao_ms])
        VALUES (@rota, @tokenId, @tokenNome, @ip, @metodo, @caminho, @status, @resultado, @motivo, @detalhes, @duracao);
      `);
  } catch (error) {
    console.error("Erro ao registrar log de rota avulsa:", error);
  }
}

const COLUNAS_LOG = colunasSql(
  ["id", "rota_chave", "token_id", "token_nome", "ip_origem", "metodo", "caminho", "status_http", "resultado", "motivo", "detalhes", "duracao_ms", "criado_em"],
  ["criado_em"]
);

interface LogRow {
  id: string;
  rota_chave: string;
  token_id: string | null;
  token_nome: string | null;
  ip_origem: string | null;
  metodo: string;
  caminho: string;
  status_http: number;
  resultado: ResultadoLogRotaAvulsa;
  motivo: string | null;
  detalhes: string | null;
  duracao_ms: number | null;
  criado_em: Date;
}

export async function listarLogsRotaAvulsa(filtros: {
  rotaChave: string;
  resultado: ResultadoLogRotaAvulsa | null;
  tokenId: string | null;
  busca: string | null;
  pagina: number;
  porPagina: number;
}): Promise<{ itens: LogRotaAvulsa[]; total: number; resumo24h: ResumoLogsRotaAvulsa }> {
  const pool = await getSqlServerPool();
  const request = pool
    .request()
    .input("rota", sql.VarChar(60), filtros.rotaChave)
    .input("resultado", sql.VarChar(20), filtros.resultado)
    .input("tokenId", sql.UniqueIdentifier, filtros.tokenId)
    .input("busca", sql.NVarChar(210), filtros.busca ? `%${filtros.busca.replace(/[[%_]/g, "[$&]")}%` : null)
    .input("pular", sql.Int, (filtros.pagina - 1) * filtros.porPagina)
    .input("porPagina", sql.Int, filtros.porPagina);

  const where = `
    WHERE [rota_chave] = @rota
      AND (@resultado IS NULL OR [resultado] = @resultado)
      AND (@tokenId IS NULL OR [token_id] = @tokenId)
      AND (@busca IS NULL OR [ip_origem] LIKE @busca OR [motivo] LIKE @busca OR [token_nome] LIKE @busca
           OR [caminho] LIKE @busca OR [detalhes] LIKE @busca)`;

  const resultado = await request.query(`
    SELECT COUNT(*) AS total FROM dbo.portal_rotas_avulsas_logs ${where};

    SELECT ${COLUNAS_LOG}
    FROM dbo.portal_rotas_avulsas_logs ${where}
    ORDER BY [criado_em] DESC
    OFFSET @pular ROWS FETCH NEXT @porPagina ROWS ONLY;

    SELECT
      SUM(CASE WHEN [resultado] = 'aceito' THEN 1 ELSE 0 END) AS aceitos,
      SUM(CASE WHEN [resultado] = 'recusado' THEN 1 ELSE 0 END) AS recusados,
      SUM(CASE WHEN [resultado] = 'erro' THEN 1 ELSE 0 END) AS erros
    FROM dbo.portal_rotas_avulsas_logs
    WHERE [rota_chave] = @rota AND [criado_em] >= DATEADD(HOUR, -24, SYSDATETIME());
  `);

  const conjuntos = resultado.recordsets as unknown as [
    { total: number }[],
    LogRow[],
    { aceitos: number | null; recusados: number | null; erros: number | null }[],
  ];
  const resumo = conjuntos[2][0];

  return {
    total: conjuntos[0][0]?.total ?? 0,
    itens: conjuntos[1].map((row) => ({
      id: row.id,
      rotaChave: row.rota_chave,
      tokenId: row.token_id,
      tokenNome: row.token_nome,
      ipOrigem: row.ip_origem,
      metodo: row.metodo,
      caminho: row.caminho,
      statusHttp: row.status_http,
      resultado: row.resultado,
      motivo: row.motivo,
      detalhes: lerJson<unknown>(row.detalhes, null),
      duracaoMs: row.duracao_ms,
      criadoEm: row.criado_em.toISOString(),
    })),
    resumo24h: { aceitos: resumo?.aceitos ?? 0, recusados: resumo?.recusados ?? 0, erros: resumo?.erros ?? 0 },
  };
}
