import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";

export interface WikiTopico {
  id: string;
  nome: string;
  icone: string | null;
  criadoEm: string;
}

interface WikiTopicoRow {
  id: string;
  nome: string;
  icone: string | null;
  criado_em: string;
}

function mapRow(row: WikiTopicoRow): WikiTopico {
  return {
    id: row.id,
    nome: row.nome,
    icone: row.icone,
    criadoEm: row.criado_em,
  };
}

export async function listarTopicos(): Promise<WikiTopico[]> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<WikiTopicoRow>(`
    SELECT
      CONVERT(VARCHAR(36), [id]) AS [id],
      [nome],
      [icone],
      CONVERT(VARCHAR(33), [criado_em], 126) AS [criado_em]
    FROM dbo.portal_wiki_topicos
    ORDER BY [nome];
  `);

  return result.recordset.map(mapRow);
}

export async function criarTopico(params: {
  nome: string;
  icone: string | null;
}): Promise<WikiTopico> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("nome", sql.NVarChar(150), params.nome);
  request.input("icone", sql.NVarChar(60), params.icone);

  const result = await request.query<WikiTopicoRow>(`
    INSERT INTO dbo.portal_wiki_topicos ([nome], [icone])
    OUTPUT
      CONVERT(VARCHAR(36), INSERTED.[id]) AS [id],
      INSERTED.[nome],
      INSERTED.[icone],
      CONVERT(VARCHAR(33), INSERTED.[criado_em], 126) AS [criado_em]
    VALUES (@nome, @icone);
  `);

  return mapRow(result.recordset[0]);
}

export async function atualizarTopico(
  id: string,
  params: { nome?: string; icone?: string | null }
): Promise<WikiTopico | null> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("id", sql.UniqueIdentifier, id);

  const sets: string[] = [];

  if (params.nome !== undefined) {
    request.input("nome", sql.NVarChar(150), params.nome);
    sets.push("[nome] = @nome");
  }

  if (params.icone !== undefined) {
    request.input("icone", sql.NVarChar(60), params.icone);
    sets.push("[icone] = @icone");
  }

  if (sets.length === 0) {
    const result = await request.query<WikiTopicoRow>(`
      SELECT
        CONVERT(VARCHAR(36), [id]) AS [id],
        [nome],
        [icone],
        CONVERT(VARCHAR(33), [criado_em], 126) AS [criado_em]
      FROM dbo.portal_wiki_topicos
      WHERE [id] = @id;
    `);
    const row = result.recordset[0];
    return row ? mapRow(row) : null;
  }

  const result = await request.query<WikiTopicoRow>(`
    UPDATE dbo.portal_wiki_topicos
    SET ${sets.join(", ")}
    OUTPUT
      CONVERT(VARCHAR(36), INSERTED.[id]) AS [id],
      INSERTED.[nome],
      INSERTED.[icone],
      CONVERT(VARCHAR(33), INSERTED.[criado_em], 126) AS [criado_em]
    WHERE [id] = @id;
  `);

  const row = result.recordset[0];
  return row ? mapRow(row) : null;
}

/*
 * O FK de portal_wiki_artigos.topico_id é ON DELETE SET NULL — excluir
 * um tópico em uso não falha, só desvincula os artigos que o usavam.
 */
export async function excluirTopico(id: string): Promise<boolean> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("id", sql.UniqueIdentifier, id);

  const result = await request.query(`
    DELETE FROM dbo.portal_wiki_topicos WHERE [id] = @id;
  `);

  return (result.rowsAffected[0] ?? 0) > 0;
}
