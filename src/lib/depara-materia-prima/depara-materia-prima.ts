import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";
import { ValidationError } from "@/lib/auth/errors";

export interface DeParaMateriaPrima {
  id: string;
  codEmpresa: string;
  codItemOrigem: string;
  descItemOrigem: string | null;
  codItemDestino: string;
  descItemDestino: string | null;
  observacao: string;
  ativo: boolean;
  criadoPor: string;
  criadoEm: string;
}

interface DeParaRow {
  id: string;
  cod_empresa: string;
  cod_item_origem: string;
  desc_item_origem: string | null;
  cod_item_destino: string;
  desc_item_destino: string | null;
  observacao: string;
  ativo: boolean;
  criado_por: string;
  criado_em: string;
}

const colunas = `
  CONVERT(VARCHAR(36), [id]) AS [id],
  [cod_empresa],
  [cod_item_origem],
  [desc_item_origem],
  [cod_item_destino],
  [desc_item_destino],
  [observacao],
  CAST([ativo] AS BIT) AS [ativo],
  [criado_por],
  CONVERT(VARCHAR(33), [criado_em], 126) AS [criado_em]
`;

function mapRow(row: DeParaRow): DeParaMateriaPrima {
  return {
    id: row.id,
    codEmpresa: row.cod_empresa,
    codItemOrigem: row.cod_item_origem,
    descItemOrigem: row.desc_item_origem,
    codItemDestino: row.cod_item_destino,
    descItemDestino: row.desc_item_destino,
    observacao: row.observacao,
    ativo: row.ativo,
    criadoPor: row.criado_por,
    criadoEm: row.criado_em,
  };
}

/*
 * Escopado por empresa: cada de-para só faz sentido dentro do
 * catálogo de itens da empresa em que foi criado (mesma empresa
 * usada na busca de itens no ERP).
 */
export async function listarDeParasPorEmpresa(
  codEmpresa: string
): Promise<DeParaMateriaPrima[]> {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("codEmpresa", sql.NVarChar(30), codEmpresa)
    .query<DeParaRow>(`
      SELECT ${colunas}
      FROM dbo.eng_man_depara_materia_prima
      WHERE [cod_empresa] = @codEmpresa
      ORDER BY [criado_em] DESC;
    `);

  return result.recordset.map(mapRow);
}

export async function criarDePara(params: {
  codEmpresa: string;
  codItemOrigem: string;
  descItemOrigem: string | null;
  codItemDestino: string;
  descItemDestino: string | null;
  observacao: string;
  criadoPor: string;
}): Promise<DeParaMateriaPrima> {
  if (params.codItemOrigem.trim() === params.codItemDestino.trim()) {
    throw new ValidationError("A MP de origem e a MP de destino não podem ser a mesma.");
  }

  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("codEmpresa", sql.NVarChar(30), params.codEmpresa);
  request.input("codItemOrigem", sql.NVarChar(30), params.codItemOrigem);
  request.input("descItemOrigem", sql.NVarChar(200), params.descItemOrigem);
  request.input("codItemDestino", sql.NVarChar(30), params.codItemDestino);
  request.input("descItemDestino", sql.NVarChar(200), params.descItemDestino);
  request.input("observacao", sql.NVarChar(500), params.observacao);
  request.input("criadoPor", sql.NVarChar(150), params.criadoPor);

  const result = await request.query<{ id: string }>(`
    INSERT INTO dbo.eng_man_depara_materia_prima
      ([cod_empresa], [cod_item_origem], [desc_item_origem], [cod_item_destino], [desc_item_destino], [observacao], [criado_por])
    OUTPUT CONVERT(VARCHAR(36), INSERTED.[id]) AS [id]
    VALUES (@codEmpresa, @codItemOrigem, @descItemOrigem, @codItemDestino, @descItemDestino, @observacao, @criadoPor);
  `);

  const criado = await buscarDeParaPorId(result.recordset[0].id);
  if (!criado) throw new Error("Falha ao criar de-para.");
  return criado;
}

export async function buscarDeParaPorId(id: string): Promise<DeParaMateriaPrima | null> {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .query<DeParaRow>(`
      SELECT ${colunas}
      FROM dbo.eng_man_depara_materia_prima
      WHERE [id] = @id;
    `);

  const row = result.recordset[0];
  return row ? mapRow(row) : null;
}

export async function atualizarAtivoDePara(
  id: string,
  ativo: boolean
): Promise<DeParaMateriaPrima> {
  const pool = await getSqlServerPool();

  await pool
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .input("ativo", sql.Bit, ativo)
    .query(`
      UPDATE dbo.eng_man_depara_materia_prima
      SET [ativo] = @ativo
      WHERE [id] = @id;
    `);

  const atualizado = await buscarDeParaPorId(id);
  if (!atualizado) throw new ValidationError("De-para não encontrado.");
  return atualizado;
}

export async function excluirDePara(id: string): Promise<boolean> {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .query(`DELETE FROM dbo.eng_man_depara_materia_prima WHERE [id] = @id;`);

  return (result.rowsAffected[0] ?? 0) > 0;
}
