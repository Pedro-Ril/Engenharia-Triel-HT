import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";
import { ValidationError } from "@/lib/auth/errors";

export interface CategoriaChamado {
  id: string;
  setorId: string;
  setorNome: string;
  nome: string;
  ativo: boolean;
  ordem: number;
}

const colunasCategoria = `
  CONVERT(VARCHAR(36), c.[id]) AS [id],
  CONVERT(VARCHAR(36), c.[setor_id]) AS [setor_id],
  s.[nome] AS [setor_nome],
  c.[nome],
  CAST(c.[ativo] AS BIT) AS [ativo],
  c.[ordem]
`;

interface CategoriaRow {
  id: string;
  setor_id: string;
  setor_nome: string;
  nome: string;
  ativo: boolean;
  ordem: number;
}

function mapCategoriaRow(row: CategoriaRow): CategoriaChamado {
  return {
    id: row.id,
    setorId: row.setor_id,
    setorNome: row.setor_nome,
    nome: row.nome,
    ativo: row.ativo,
    ordem: row.ordem,
  };
}

/* Painel de administração — inclui inativas, para poder reativá-las. */
export async function listarCategoriasAdmin(): Promise<CategoriaChamado[]> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<CategoriaRow>(`
    SELECT ${colunasCategoria}
    FROM dbo.portal_chamados_categorias AS c
    INNER JOIN dbo.portal_setores AS s ON s.[id] = c.[setor_id]
    ORDER BY s.[nome], c.[ordem], c.[nome];
  `);

  return result.recordset.map(mapCategoriaRow);
}

/*
 * Usada no dropdown de abertura de chamado (filtrado por setor no
 * cliente) e nos filtros de fila/dashboard — só categorias ativas.
 */
export async function listarCategoriasAtivas(): Promise<CategoriaChamado[]> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<CategoriaRow>(`
    SELECT ${colunasCategoria}
    FROM dbo.portal_chamados_categorias AS c
    INNER JOIN dbo.portal_setores AS s ON s.[id] = c.[setor_id]
    WHERE c.[ativo] = 1
    ORDER BY s.[nome], c.[ordem], c.[nome];
  `);

  return result.recordset.map(mapCategoriaRow);
}

export async function criarCategoria(params: {
  setorId: string;
  nome: string;
  ordem: number;
}): Promise<CategoriaChamado> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("setorId", sql.UniqueIdentifier, params.setorId);
  request.input("nome", sql.NVarChar(120), params.nome);
  request.input("ordem", sql.Int, params.ordem);

  try {
    const result = await request.query<{ id: string }>(`
      INSERT INTO dbo.portal_chamados_categorias ([setor_id], [nome], [ordem])
      OUTPUT CONVERT(VARCHAR(36), INSERTED.[id]) AS [id]
      VALUES (@setorId, @nome, @ordem);
    `);

    const criadoId = result.recordset[0].id;

    const detalhe = await pool
      .request()
      .input("id", sql.UniqueIdentifier, criadoId)
      .query<CategoriaRow>(`
        SELECT ${colunasCategoria}
        FROM dbo.portal_chamados_categorias AS c
        INNER JOIN dbo.portal_setores AS s ON s.[id] = c.[setor_id]
        WHERE c.[id] = @id;
      `);

    return mapCategoriaRow(detalhe.recordset[0]);
  } catch (error) {
    if (
      error instanceof Error &&
      /UQ_portal_chamados_categorias_setor_nome/i.test(error.message)
    ) {
      throw new ValidationError("Já existe uma categoria com este nome neste setor.");
    }

    if (error instanceof Error && /FK_portal_chamados_categorias_setor/i.test(error.message)) {
      throw new ValidationError("O setor selecionado não existe.");
    }

    throw error;
  }
}

export async function atualizarCategoria(
  id: string,
  params: { nome?: string; ordem?: number; ativo?: boolean }
): Promise<CategoriaChamado> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("id", sql.UniqueIdentifier, id);

  const sets: string[] = [];

  if (params.nome !== undefined) {
    request.input("nome", sql.NVarChar(120), params.nome);
    sets.push("[nome] = @nome");
  }

  if (params.ordem !== undefined) {
    request.input("ordem", sql.Int, params.ordem);
    sets.push("[ordem] = @ordem");
  }

  if (params.ativo !== undefined) {
    request.input("ativo", sql.Bit, params.ativo);
    sets.push("[ativo] = @ativo");
  }

  if (sets.length === 0) {
    throw new ValidationError("Nenhum campo para atualizar foi informado.");
  }

  try {
    await request.query(`
      UPDATE dbo.portal_chamados_categorias
      SET ${sets.join(", ")}
      WHERE [id] = @id;
    `);
  } catch (error) {
    if (
      error instanceof Error &&
      /UQ_portal_chamados_categorias_setor_nome/i.test(error.message)
    ) {
      throw new ValidationError("Já existe uma categoria com este nome neste setor.");
    }

    throw error;
  }

  const detalhe = await pool
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .query<CategoriaRow>(`
      SELECT ${colunasCategoria}
      FROM dbo.portal_chamados_categorias AS c
      INNER JOIN dbo.portal_setores AS s ON s.[id] = c.[setor_id]
      WHERE c.[id] = @id;
    `);

  return mapCategoriaRow(detalhe.recordset[0]);
}

export async function excluirCategoria(id: string): Promise<boolean> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("id", sql.UniqueIdentifier, id);

  try {
    const result = await request.query(`
      DELETE FROM dbo.portal_chamados_categorias
      WHERE [id] = @id;
    `);

    return (result.rowsAffected[0] ?? 0) > 0;
  } catch (error) {
    if (error instanceof Error && /FK_portal_chamados_categoria\b/i.test(error.message)) {
      throw new ValidationError(
        "Esta categoria já foi usada em chamados — desative-a em vez de excluir."
      );
    }

    throw error;
  }
}
