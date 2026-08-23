import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";

export interface DownloadPublico {
  id: string;
  nome: string;
  descricao: string;
  tag: string | null;
  nomeArquivo: string;
  tamanhoBytes: number;
  instrucoes: string[];
  funcionamento: string[];
}

export interface DownloadAdmin extends DownloadPublico {
  ordem: number;
  ativo: boolean;
  criadoEm: string;
  atualizadoEm: string;
  criadoPor: string | null;
}

export interface ConteudoDownload {
  nomeArquivo: string;
  tipoMime: string;
  conteudo: Buffer;
}

function parseListaTexto(valor: string | null): string[] {
  if (!valor) return [];

  try {
    const lista: unknown = JSON.parse(valor);
    return Array.isArray(lista) ? lista.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function serializarListaTexto(lista: string[]): string {
  return JSON.stringify(lista);
}

interface DownloadRow {
  id: string;
  nome: string;
  descricao: string;
  tag: string | null;
  nome_arquivo: string;
  tamanho_bytes: number;
  instrucoes: string | null;
  funcionamento: string | null;
}

interface DownloadAdminRow extends DownloadRow {
  ordem: number;
  ativo: boolean;
  criado_em: Date;
  atualizado_em: Date;
  criado_por: string | null;
}

const colunasPublicas = `
  CONVERT(VARCHAR(36), [id]) AS [id],
  [nome],
  [descricao],
  [tag],
  [nome_arquivo],
  [tamanho_bytes],
  [instrucoes],
  [funcionamento]
`;

const colunasAdmin = `
  ${colunasPublicas},
  [ordem],
  CAST([ativo] AS BIT) AS [ativo],
  [criado_em],
  [atualizado_em],
  [criado_por]
`;

const colunasSaidaAdmin = `
  CONVERT(VARCHAR(36), INSERTED.[id]) AS [id],
  INSERTED.[nome],
  INSERTED.[descricao],
  INSERTED.[tag],
  INSERTED.[nome_arquivo],
  INSERTED.[tamanho_bytes],
  INSERTED.[instrucoes],
  INSERTED.[funcionamento],
  INSERTED.[ordem],
  CAST(INSERTED.[ativo] AS BIT) AS [ativo],
  INSERTED.[criado_em],
  INSERTED.[atualizado_em],
  INSERTED.[criado_por]
`;

function mapearPublico(row: DownloadRow): DownloadPublico {
  return {
    id: row.id,
    nome: row.nome,
    descricao: row.descricao,
    tag: row.tag,
    nomeArquivo: row.nome_arquivo,
    tamanhoBytes: row.tamanho_bytes,
    instrucoes: parseListaTexto(row.instrucoes),
    funcionamento: parseListaTexto(row.funcionamento),
  };
}

function mapearAdmin(row: DownloadAdminRow): DownloadAdmin {
  return {
    ...mapearPublico(row),
    ordem: row.ordem,
    ativo: row.ativo,
    criadoEm: row.criado_em.toISOString(),
    atualizadoEm: row.atualizado_em.toISOString(),
    criadoPor: row.criado_por,
  };
}

export async function listarDownloadsPublicos(): Promise<DownloadPublico[]> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<DownloadRow>(`
    SELECT ${colunasPublicas}
    FROM dbo.portal_downloads
    WHERE [ativo] = 1
    ORDER BY [ordem], [nome];
  `);

  return result.recordset.map(mapearPublico);
}

export async function listarDownloadsAdmin(): Promise<DownloadAdmin[]> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<DownloadAdminRow>(`
    SELECT ${colunasAdmin}
    FROM dbo.portal_downloads
    ORDER BY [ordem], [nome];
  `);

  return result.recordset.map(mapearAdmin);
}

/*
 * Separado do resto — não traz o `conteudo` (blob), que só é
 * buscado depois, na hora de servir o download de verdade (ver
 * src/app/api/downloads/[id]/arquivo/route.ts).
 */
export async function buscarConteudoDownload(id: string): Promise<ConteudoDownload | null> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("id", sql.UniqueIdentifier, id);

  const result = await request.query<{
    nome_arquivo: string;
    tipo_mime: string;
    conteudo: Buffer;
    ativo: boolean;
  }>(`
    SELECT [nome_arquivo], [tipo_mime], [conteudo], CAST([ativo] AS BIT) AS [ativo]
    FROM dbo.portal_downloads
    WHERE [id] = @id;
  `);

  const row = result.recordset[0];
  if (!row || !row.ativo) return null;

  return { nomeArquivo: row.nome_arquivo, tipoMime: row.tipo_mime, conteudo: row.conteudo };
}

export async function criarDownload(params: {
  nome: string;
  descricao: string;
  tag: string | null;
  instrucoes: string[];
  funcionamento: string[];
  ordem: number;
  criadoPor: string;
  arquivo: { nomeArquivo: string; tipoMime: string; tamanhoBytes: number; conteudo: Buffer };
}): Promise<DownloadAdmin> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("nome", sql.NVarChar(200), params.nome);
  request.input("descricao", sql.NVarChar(1000), params.descricao);
  request.input("tag", sql.NVarChar(60), params.tag);
  request.input("instrucoes", sql.NVarChar(sql.MAX), serializarListaTexto(params.instrucoes));
  request.input("funcionamento", sql.NVarChar(sql.MAX), serializarListaTexto(params.funcionamento));
  request.input("ordem", sql.Int, params.ordem);
  request.input("criadoPor", sql.NVarChar(150), params.criadoPor);
  request.input("nomeArquivo", sql.NVarChar(260), params.arquivo.nomeArquivo);
  request.input("tipoMime", sql.NVarChar(150), params.arquivo.tipoMime);
  request.input("tamanhoBytes", sql.Int, params.arquivo.tamanhoBytes);
  request.input("conteudo", sql.VarBinary(sql.MAX), params.arquivo.conteudo);

  const result = await request.query<DownloadAdminRow>(`
    INSERT INTO dbo.portal_downloads
      ([nome], [descricao], [tag], [nome_arquivo], [tipo_mime], [tamanho_bytes], [conteudo], [instrucoes], [funcionamento], [ordem], [criado_por])
    OUTPUT ${colunasSaidaAdmin}
    VALUES (@nome, @descricao, @tag, @nomeArquivo, @tipoMime, @tamanhoBytes, @conteudo, @instrucoes, @funcionamento, @ordem, @criadoPor);
  `);

  return mapearAdmin(result.recordset[0]);
}

export async function atualizarDownload(
  id: string,
  params: {
    nome: string;
    descricao: string;
    tag: string | null;
    instrucoes: string[];
    funcionamento: string[];
    ordem: number;
    ativo: boolean;
    arquivo?: { nomeArquivo: string; tipoMime: string; tamanhoBytes: number; conteudo: Buffer };
  }
): Promise<DownloadAdmin | null> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("id", sql.UniqueIdentifier, id);
  request.input("nome", sql.NVarChar(200), params.nome);
  request.input("descricao", sql.NVarChar(1000), params.descricao);
  request.input("tag", sql.NVarChar(60), params.tag);
  request.input("instrucoes", sql.NVarChar(sql.MAX), serializarListaTexto(params.instrucoes));
  request.input("funcionamento", sql.NVarChar(sql.MAX), serializarListaTexto(params.funcionamento));
  request.input("ordem", sql.Int, params.ordem);
  request.input("ativo", sql.Bit, params.ativo);

  let clausulaArquivo = "";
  if (params.arquivo) {
    request.input("nomeArquivo", sql.NVarChar(260), params.arquivo.nomeArquivo);
    request.input("tipoMime", sql.NVarChar(150), params.arquivo.tipoMime);
    request.input("tamanhoBytes", sql.Int, params.arquivo.tamanhoBytes);
    request.input("conteudo", sql.VarBinary(sql.MAX), params.arquivo.conteudo);
    clausulaArquivo = `,
      [nome_arquivo] = @nomeArquivo,
      [tipo_mime] = @tipoMime,
      [tamanho_bytes] = @tamanhoBytes,
      [conteudo] = @conteudo`;
  }

  const result = await request.query<DownloadAdminRow>(`
    UPDATE dbo.portal_downloads
    SET
      [nome] = @nome,
      [descricao] = @descricao,
      [tag] = @tag,
      [instrucoes] = @instrucoes,
      [funcionamento] = @funcionamento,
      [ordem] = @ordem,
      [ativo] = @ativo,
      [atualizado_em] = SYSDATETIME()
      ${clausulaArquivo}
    OUTPUT ${colunasSaidaAdmin}
    WHERE [id] = @id;
  `);

  return result.recordset[0] ? mapearAdmin(result.recordset[0]) : null;
}

export async function excluirDownload(id: string): Promise<boolean> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("id", sql.UniqueIdentifier, id);

  const result = await request.query(`
    DELETE FROM dbo.portal_downloads WHERE [id] = @id;
  `);

  return (result.rowsAffected[0] ?? 0) > 0;
}
