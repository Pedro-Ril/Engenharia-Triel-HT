import "server-only";

import { ValidationError } from "@/lib/auth/errors";
import { getSqlServerPool, sql } from "@/lib/database/sql-server";
import type { TipoArquivoDerivado } from "@/modules/conferencia-derivados/constants/tipos-arquivo";

/*
 * Pastas de cada empresa (eng_conferencia_derivados_pastas, migração
 * 0143). A conferência usa as da empresa do cadastro do usuário; a
 * administração lista todas as empresas ativas, configuradas ou não.
 */
export interface PastasEmpresaConferencia {
  empresaId: string;
  empresaNome: string;
  empresaCodigo: string | null;
  /* Usuários cujo cadastro aponta para esta empresa. */
  totalUsuarios: number;
  pastaPdf: string | null;
  pastaDxf: string | null;
  pastaStep: string | null;
  atualizadoEm: string | null;
  atualizadoPor: string | null;
}

type LinhaPastas = {
  empresa_id: string;
  empresa_nome: string;
  empresa_codigo: string | null;
  total_usuarios: number;
  pasta_pdf: string | null;
  pasta_dxf: string | null;
  pasta_step: string | null;
  atualizado_em: string | null;
  atualizado_por: string | null;
};

function paraPastas(linha: LinhaPastas): PastasEmpresaConferencia {
  return {
    empresaId: linha.empresa_id,
    empresaNome: linha.empresa_nome,
    empresaCodigo: linha.empresa_codigo,
    totalUsuarios: linha.total_usuarios,
    pastaPdf: linha.pasta_pdf,
    pastaDxf: linha.pasta_dxf,
    pastaStep: linha.pasta_step,
    atualizadoEm: linha.atualizado_em,
    atualizadoPor: linha.atualizado_por,
  };
}

const SELECT_PASTAS = `
  SELECT
    CONVERT(VARCHAR(36), e.[id]) AS [empresa_id],
    e.[nome] AS [empresa_nome],
    e.[codigo] AS [empresa_codigo],
    (
      SELECT COUNT(*) FROM dbo.portal_usuarios AS u
      WHERE LOWER(LTRIM(RTRIM(u.[codigo_empresa]))) = LOWER(LTRIM(RTRIM(e.[codigo])))
    ) AS [total_usuarios],
    p.[pasta_pdf],
    p.[pasta_dxf],
    p.[pasta_step],
    CONVERT(VARCHAR(33), p.[atualizado_em], 126) AS [atualizado_em],
    p.[atualizado_por]
  FROM dbo.portal_empresas AS e
  LEFT JOIN dbo.eng_conferencia_derivados_pastas AS p
    ON p.[empresa_id] = e.[id]`;

export async function listarPastasPorEmpresa(): Promise<PastasEmpresaConferencia[]> {
  const pool = await getSqlServerPool();
  const result = await pool.request().query<LinhaPastas>(`
    ${SELECT_PASTAS}
    WHERE e.[ativa] = 1
    ORDER BY e.[nome];
  `);
  return result.recordset.map(paraPastas);
}

export async function salvarPastasEmpresa(params: {
  empresaId: string;
  pastaPdf: string | null;
  pastaDxf: string | null;
  pastaStep: string | null;
  atualizadoPor: string;
}): Promise<PastasEmpresaConferencia> {
  const pool = await getSqlServerPool();

  const empresa = await pool
    .request()
    .input("empresaId", sql.UniqueIdentifier, params.empresaId)
    .query<{ id: string }>(`SELECT [id] FROM dbo.portal_empresas WHERE [id] = @empresaId AND [ativa] = 1;`);
  if (!empresa.recordset[0]) throw new ValidationError("Empresa não encontrada ou inativa.");

  const request = pool.request();
  request.input("empresaId", sql.UniqueIdentifier, params.empresaId);
  request.input("pastaPdf", sql.NVarChar(300), params.pastaPdf);
  request.input("pastaDxf", sql.NVarChar(300), params.pastaDxf);
  request.input("pastaStep", sql.NVarChar(300), params.pastaStep);
  request.input("atualizadoPor", sql.NVarChar(150), params.atualizadoPor);

  await request.query(`
    MERGE dbo.eng_conferencia_derivados_pastas AS destino
    USING (SELECT @empresaId AS [empresa_id]) AS origem
    ON destino.[empresa_id] = origem.[empresa_id]
    WHEN MATCHED THEN
      UPDATE SET
        [pasta_pdf] = @pastaPdf,
        [pasta_dxf] = @pastaDxf,
        [pasta_step] = @pastaStep,
        [atualizado_em] = SYSDATETIME(),
        [atualizado_por] = @atualizadoPor
    WHEN NOT MATCHED THEN
      INSERT ([empresa_id], [pasta_pdf], [pasta_dxf], [pasta_step], [atualizado_por])
      VALUES (@empresaId, @pastaPdf, @pastaDxf, @pastaStep, @atualizadoPor);
  `);

  const atualizada = await pool
    .request()
    .input("empresaId", sql.UniqueIdentifier, params.empresaId)
    .query<LinhaPastas>(`${SELECT_PASTAS} WHERE e.[id] = @empresaId;`);
  return paraPastas(atualizada.recordset[0]);
}

/* A pasta de cada tipo da empresa, como a conferência precisa (null = não configurada). */
export async function obterPastasDaEmpresa(
  empresaId: string
): Promise<Record<TipoArquivoDerivado, string | null>> {
  const pool = await getSqlServerPool();
  const result = await pool
    .request()
    .input("empresaId", sql.UniqueIdentifier, empresaId)
    .query<Pick<LinhaPastas, "pasta_pdf" | "pasta_dxf" | "pasta_step">>(`
      SELECT [pasta_pdf], [pasta_dxf], [pasta_step]
      FROM dbo.eng_conferencia_derivados_pastas
      WHERE [empresa_id] = @empresaId;
    `);
  const linha = result.recordset[0];

  return {
    pdf: linha?.pasta_pdf ?? null,
    dxf: linha?.pasta_dxf ?? null,
    step: linha?.pasta_step ?? null,
  };
}
