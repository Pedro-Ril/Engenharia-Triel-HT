import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";
import { ValidationError } from "@/lib/auth/errors";

import type { CorTag } from "./cores-tag";

export type TipoAtualizacaoItem = "novo" | "melhoria" | "correcao";

export interface AtualizacaoTag {
  id: string;
  chave: string;
  nome: string;
  cor: CorTag;
  ordem: number;
  ativo: boolean;
}

export interface AtualizacaoItem {
  id: string;
  tipo: TipoAtualizacaoItem;
  texto: string;
  ordem: number;
}

export interface Atualizacao {
  id: string;
  versao: string;
  titulo: string;
  descricao: string;
  publicadoEm: string;
  publicado: boolean;
  ordem: number;
  tags: AtualizacaoTag[];
  itens: AtualizacaoItem[];
  criadoEm: string;
  atualizadoEm: string;
  criadoPor: string | null;
}

/* =========================================================
   TAGS
   ========================================================= */

export async function listarTags(): Promise<AtualizacaoTag[]> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<{
    id: string;
    chave: string;
    nome: string;
    cor: string;
    ordem: number;
    ativo: boolean;
  }>(`
    SELECT
      CONVERT(VARCHAR(36), [id]) AS [id],
      [chave],
      [nome],
      [cor],
      [ordem],
      CAST([ativo] AS BIT) AS [ativo]
    FROM dbo.portal_atualizacao_tags
    ORDER BY [ordem], [nome];
  `);

  return result.recordset.map((row) => ({ ...row, cor: row.cor as CorTag }));
}

export async function criarTag(params: {
  chave: string;
  nome: string;
  cor: string;
  ordem: number;
}): Promise<AtualizacaoTag> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("chave", sql.VarChar(60), params.chave);
  request.input("nome", sql.NVarChar(100), params.nome);
  request.input("cor", sql.VarChar(20), params.cor);
  request.input("ordem", sql.Int, params.ordem);

  try {
    const result = await request.query<{
      id: string;
      chave: string;
      nome: string;
      cor: string;
      ordem: number;
      ativo: boolean;
    }>(`
      INSERT INTO dbo.portal_atualizacao_tags ([chave], [nome], [cor], [ordem])
      OUTPUT
        CONVERT(VARCHAR(36), INSERTED.[id]) AS [id],
        INSERTED.[chave],
        INSERTED.[nome],
        INSERTED.[cor],
        INSERTED.[ordem],
        CAST(INSERTED.[ativo] AS BIT) AS [ativo]
      VALUES (@chave, @nome, @cor, @ordem);
    `);

    const row = result.recordset[0];
    return { ...row, cor: row.cor as CorTag };
  } catch (error) {
    if (
      error instanceof Error &&
      /UQ_portal_atualizacao_tags_chave/i.test(error.message)
    ) {
      throw new ValidationError("Já existe uma tag com esta chave.");
    }

    throw error;
  }
}

export async function atualizarTag(
  id: string,
  params: { nome: string; cor: string; ordem: number; ativo: boolean }
): Promise<AtualizacaoTag | null> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("id", sql.UniqueIdentifier, id);
  request.input("nome", sql.NVarChar(100), params.nome);
  request.input("cor", sql.VarChar(20), params.cor);
  request.input("ordem", sql.Int, params.ordem);
  request.input("ativo", sql.Bit, params.ativo);

  const result = await request.query<{
    id: string;
    chave: string;
    nome: string;
    cor: string;
    ordem: number;
    ativo: boolean;
  }>(`
    UPDATE dbo.portal_atualizacao_tags
    SET [nome] = @nome, [cor] = @cor, [ordem] = @ordem, [ativo] = @ativo
    OUTPUT
      CONVERT(VARCHAR(36), INSERTED.[id]) AS [id],
      INSERTED.[chave],
      INSERTED.[nome],
      INSERTED.[cor],
      INSERTED.[ordem],
      CAST(INSERTED.[ativo] AS BIT) AS [ativo]
    WHERE [id] = @id;
  `);

  const row = result.recordset[0];
  return row ? { ...row, cor: row.cor as CorTag } : null;
}

export async function excluirTag(id: string): Promise<boolean> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("id", sql.UniqueIdentifier, id);

  const emUso = await request.query<{ total: number }>(`
    SELECT COUNT(*) AS [total]
    FROM dbo.portal_atualizacao_modulos
    WHERE [tag_id] = @id;
  `);

  if ((emUso.recordset[0]?.total ?? 0) > 0) {
    throw new ValidationError(
      "Esta tag está em uso em uma ou mais atualizações — remova-a delas antes de excluir."
    );
  }

  const result = await request.query(`
    DELETE FROM dbo.portal_atualizacao_tags WHERE [id] = @id;
  `);

  return (result.rowsAffected[0] ?? 0) > 0;
}

/* =========================================================
   ATUALIZAÇÕES
   ========================================================= */

const colunasAtualizacao = `
  CONVERT(VARCHAR(36), a.[id]) AS [id],
  a.[versao],
  a.[titulo],
  a.[descricao],
  CONVERT(VARCHAR(33), a.[publicado_em], 126) AS [publicado_em],
  CAST(a.[publicado] AS BIT) AS [publicado],
  a.[ordem],
  CONVERT(VARCHAR(33), a.[criado_em], 126) AS [criado_em],
  CONVERT(VARCHAR(33), a.[atualizado_em], 126) AS [atualizado_em],
  a.[criado_por]
`;

interface AtualizacaoRow {
  id: string;
  versao: string;
  titulo: string;
  descricao: string;
  publicado_em: string;
  publicado: boolean;
  ordem: number;
  criado_em: string;
  atualizado_em: string;
  criado_por: string | null;
}

async function carregarItensETags(
  atualizacaoIds: string[]
): Promise<{
  itensPorAtualizacao: Map<string, AtualizacaoItem[]>;
  tagsPorAtualizacao: Map<string, AtualizacaoTag[]>;
}> {
  const itensPorAtualizacao = new Map<string, AtualizacaoItem[]>();
  const tagsPorAtualizacao = new Map<string, AtualizacaoTag[]>();

  if (atualizacaoIds.length === 0) {
    return { itensPorAtualizacao, tagsPorAtualizacao };
  }

  const pool = await getSqlServerPool();

  const itensResult = await pool.request().query<{
    atualizacao_id: string;
    id: string;
    tipo: string;
    texto: string;
    ordem: number;
  }>(`
    SELECT
      CONVERT(VARCHAR(36), [atualizacao_id]) AS [atualizacao_id],
      CONVERT(VARCHAR(36), [id]) AS [id],
      [tipo],
      [texto],
      [ordem]
    FROM dbo.portal_atualizacao_itens
    ORDER BY [ordem];
  `);

  for (const row of itensResult.recordset) {
    const lista = itensPorAtualizacao.get(row.atualizacao_id) ?? [];
    lista.push({
      id: row.id,
      tipo: row.tipo as TipoAtualizacaoItem,
      texto: row.texto,
      ordem: row.ordem,
    });
    itensPorAtualizacao.set(row.atualizacao_id, lista);
  }

  const tagsResult = await pool.request().query<{
    atualizacao_id: string;
    id: string;
    chave: string;
    nome: string;
    cor: string;
    ordem: number;
    ativo: boolean;
  }>(`
    SELECT
      CONVERT(VARCHAR(36), m.[atualizacao_id]) AS [atualizacao_id],
      CONVERT(VARCHAR(36), t.[id]) AS [id],
      t.[chave],
      t.[nome],
      t.[cor],
      t.[ordem],
      CAST(t.[ativo] AS BIT) AS [ativo]
    FROM dbo.portal_atualizacao_modulos AS m
    INNER JOIN dbo.portal_atualizacao_tags AS t
      ON t.[id] = m.[tag_id]
    ORDER BY t.[ordem], t.[nome];
  `);

  for (const row of tagsResult.recordset) {
    const lista = tagsPorAtualizacao.get(row.atualizacao_id) ?? [];
    lista.push({
      id: row.id,
      chave: row.chave,
      nome: row.nome,
      cor: row.cor as CorTag,
      ordem: row.ordem,
      ativo: row.ativo,
    });
    tagsPorAtualizacao.set(row.atualizacao_id, lista);
  }

  return { itensPorAtualizacao, tagsPorAtualizacao };
}

function mapAtualizacao(
  row: AtualizacaoRow,
  itensPorAtualizacao: Map<string, AtualizacaoItem[]>,
  tagsPorAtualizacao: Map<string, AtualizacaoTag[]>
): Atualizacao {
  return {
    id: row.id,
    versao: row.versao,
    titulo: row.titulo,
    descricao: row.descricao,
    publicadoEm: row.publicado_em,
    publicado: row.publicado,
    ordem: row.ordem,
    tags: tagsPorAtualizacao.get(row.id) ?? [],
    itens: itensPorAtualizacao.get(row.id) ?? [],
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em,
    criadoPor: row.criado_por,
  };
}

export async function listarAtualizacoes(
  opts: { apenasPublicadas?: boolean } = {}
): Promise<Atualizacao[]> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<AtualizacaoRow>(`
    SELECT ${colunasAtualizacao}
    FROM dbo.portal_atualizacoes AS a
    ${opts.apenasPublicadas ? "WHERE a.[publicado] = 1" : ""}
    ORDER BY a.[ordem] DESC, a.[publicado_em] DESC;
  `);

  const ids = result.recordset.map((row) => row.id);
  const { itensPorAtualizacao, tagsPorAtualizacao } =
    await carregarItensETags(ids);

  return result.recordset.map((row) =>
    mapAtualizacao(row, itensPorAtualizacao, tagsPorAtualizacao)
  );
}

export interface SalvarAtualizacaoParams {
  versao: string;
  titulo: string;
  descricao: string;
  publicadoEm: string;
  publicado: boolean;
  ordem: number;
  tagIds: string[];
  itens: { tipo: TipoAtualizacaoItem; texto: string }[];
  criadoPor?: string;
}

export async function criarAtualizacao(
  params: SalvarAtualizacaoParams
): Promise<Atualizacao> {
  const pool = await getSqlServerPool();
  const transaction = new sql.Transaction(pool);

  await transaction.begin();

  try {
    const insertRequest = new sql.Request(transaction);

    insertRequest.input("versao", sql.NVarChar(30), params.versao);
    insertRequest.input("titulo", sql.NVarChar(200), params.titulo);
    insertRequest.input("descricao", sql.NVarChar(sql.MAX), params.descricao);
    insertRequest.input("publicadoEm", sql.DateTime2, params.publicadoEm);
    insertRequest.input("publicado", sql.Bit, params.publicado);
    insertRequest.input("ordem", sql.Int, params.ordem);
    insertRequest.input("criadoPor", sql.NVarChar(150), params.criadoPor ?? null);

    const insertResult = await insertRequest.query<{ id: string }>(`
      INSERT INTO dbo.portal_atualizacoes
        ([versao], [titulo], [descricao], [publicado_em], [publicado], [ordem], [criado_por])
      OUTPUT CONVERT(VARCHAR(36), INSERTED.[id]) AS [id]
      VALUES (@versao, @titulo, @descricao, @publicadoEm, @publicado, @ordem, @criadoPor);
    `);

    const atualizacaoId = insertResult.recordset[0].id;

    await inserirItens(transaction, atualizacaoId, params.itens);
    await sincronizarTags(transaction, atualizacaoId, params.tagIds);

    await transaction.commit();

    const [atualizacao] = await buscarPorIds([atualizacaoId]);
    return atualizacao;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function atualizarAtualizacao(
  id: string,
  params: SalvarAtualizacaoParams
): Promise<Atualizacao | null> {
  const pool = await getSqlServerPool();
  const transaction = new sql.Transaction(pool);

  await transaction.begin();

  try {
    const updateRequest = new sql.Request(transaction);

    updateRequest.input("id", sql.UniqueIdentifier, id);
    updateRequest.input("versao", sql.NVarChar(30), params.versao);
    updateRequest.input("titulo", sql.NVarChar(200), params.titulo);
    updateRequest.input("descricao", sql.NVarChar(sql.MAX), params.descricao);
    updateRequest.input("publicadoEm", sql.DateTime2, params.publicadoEm);
    updateRequest.input("publicado", sql.Bit, params.publicado);
    updateRequest.input("ordem", sql.Int, params.ordem);

    const updateResult = await updateRequest.query(`
      UPDATE dbo.portal_atualizacoes
      SET
        [versao] = @versao,
        [titulo] = @titulo,
        [descricao] = @descricao,
        [publicado_em] = @publicadoEm,
        [publicado] = @publicado,
        [ordem] = @ordem,
        [atualizado_em] = SYSDATETIME()
      WHERE [id] = @id;
    `);

    if ((updateResult.rowsAffected[0] ?? 0) === 0) {
      await transaction.rollback();
      return null;
    }

    const deleteItensRequest = new sql.Request(transaction);
    deleteItensRequest.input("id", sql.UniqueIdentifier, id);
    await deleteItensRequest.query(`
      DELETE FROM dbo.portal_atualizacao_itens WHERE [atualizacao_id] = @id;
    `);

    await inserirItens(transaction, id, params.itens);
    await sincronizarTags(transaction, id, params.tagIds);

    await transaction.commit();

    const [atualizacao] = await buscarPorIds([id]);
    return atualizacao ?? null;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function inserirItens(
  transaction: InstanceType<typeof sql.Transaction>,
  atualizacaoId: string,
  itens: { tipo: TipoAtualizacaoItem; texto: string }[]
) {
  for (const [indice, item] of itens.entries()) {
    const request = new sql.Request(transaction);

    request.input("atualizacaoId", sql.UniqueIdentifier, atualizacaoId);
    request.input("tipo", sql.VarChar(20), item.tipo);
    request.input("texto", sql.NVarChar(500), item.texto);
    request.input("ordem", sql.Int, indice);

    await request.query(`
      INSERT INTO dbo.portal_atualizacao_itens
        ([atualizacao_id], [tipo], [texto], [ordem])
      VALUES (@atualizacaoId, @tipo, @texto, @ordem);
    `);
  }
}

async function sincronizarTags(
  transaction: InstanceType<typeof sql.Transaction>,
  atualizacaoId: string,
  tagIds: string[]
) {
  const deleteRequest = new sql.Request(transaction);
  deleteRequest.input("atualizacaoId", sql.UniqueIdentifier, atualizacaoId);
  await deleteRequest.query(`
    DELETE FROM dbo.portal_atualizacao_modulos WHERE [atualizacao_id] = @atualizacaoId;
  `);

  for (const tagId of tagIds) {
    const request = new sql.Request(transaction);
    request.input("atualizacaoId", sql.UniqueIdentifier, atualizacaoId);
    request.input("tagId", sql.UniqueIdentifier, tagId);

    await request.query(`
      INSERT INTO dbo.portal_atualizacao_modulos ([atualizacao_id], [tag_id])
      VALUES (@atualizacaoId, @tagId);
    `);
  }
}

async function buscarPorIds(ids: string[]): Promise<Atualizacao[]> {
  if (ids.length === 0) return [];

  const pool = await getSqlServerPool();
  const request = pool.request();

  const parametros = ids.map((id, indice) => {
    request.input(`id${indice}`, sql.UniqueIdentifier, id);
    return `@id${indice}`;
  });

  const result = await request.query<AtualizacaoRow>(`
    SELECT ${colunasAtualizacao}
    FROM dbo.portal_atualizacoes AS a
    WHERE a.[id] IN (${parametros.join(", ")});
  `);

  const { itensPorAtualizacao, tagsPorAtualizacao } = await carregarItensETags(
    ids
  );

  return result.recordset.map((row) =>
    mapAtualizacao(row, itensPorAtualizacao, tagsPorAtualizacao)
  );
}

export async function excluirAtualizacao(id: string): Promise<boolean> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("id", sql.UniqueIdentifier, id);

  const result = await request.query(`
    DELETE FROM dbo.portal_atualizacoes WHERE [id] = @id;
  `);

  return (result.rowsAffected[0] ?? 0) > 0;
}
