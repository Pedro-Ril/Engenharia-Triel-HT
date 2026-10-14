import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";
import type { TipoArquivoDerivado } from "@/modules/conferencia-derivados/constants/tipos-arquivo";

export interface ConfigConferenciaDerivados {
  pastaPdf: string | null;
  pastaDxf: string | null;
  pastaStep: string | null;
  atualizadoEm: string | null;
  atualizadoPor: string | null;
}

type LinhaConfig = {
  pasta_pdf: string | null;
  pasta_dxf: string | null;
  pasta_step: string | null;
  atualizado_em: string | null;
  atualizado_por: string | null;
};

/* Singleton id = 1, mesmo desenho de integra_lantek_config. */
export async function buscarConfigConferenciaDerivados(): Promise<ConfigConferenciaDerivados> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<LinhaConfig>(`
    SELECT
      [pasta_pdf],
      [pasta_dxf],
      [pasta_step],
      CONVERT(VARCHAR(33), [atualizado_em], 126) AS [atualizado_em],
      [atualizado_por]
    FROM dbo.eng_conferencia_derivados_config
    WHERE [id] = 1;
  `);

  const row = result.recordset[0];

  return {
    pastaPdf: row?.pasta_pdf ?? null,
    pastaDxf: row?.pasta_dxf ?? null,
    pastaStep: row?.pasta_step ?? null,
    atualizadoEm: row?.atualizado_em ?? null,
    atualizadoPor: row?.atualizado_por ?? null,
  };
}

export async function salvarConfigConferenciaDerivados(params: {
  pastaPdf: string | null;
  pastaDxf: string | null;
  pastaStep: string | null;
  atualizadoPor: string;
}): Promise<ConfigConferenciaDerivados> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("pastaPdf", sql.NVarChar(300), params.pastaPdf);
  request.input("pastaDxf", sql.NVarChar(300), params.pastaDxf);
  request.input("pastaStep", sql.NVarChar(300), params.pastaStep);
  request.input("atualizadoPor", sql.NVarChar(150), params.atualizadoPor);

  await request.query(`
    MERGE dbo.eng_conferencia_derivados_config AS destino
    USING (SELECT 1 AS [id]) AS origem
    ON destino.[id] = origem.[id]
    WHEN MATCHED THEN
      UPDATE SET
        [pasta_pdf] = @pastaPdf,
        [pasta_dxf] = @pastaDxf,
        [pasta_step] = @pastaStep,
        [atualizado_em] = SYSDATETIME(),
        [atualizado_por] = @atualizadoPor
    WHEN NOT MATCHED THEN
      INSERT ([id], [pasta_pdf], [pasta_dxf], [pasta_step], [atualizado_em], [atualizado_por])
      VALUES (1, @pastaPdf, @pastaDxf, @pastaStep, SYSDATETIME(), @atualizadoPor);
  `);

  return buscarConfigConferenciaDerivados();
}

/* A pasta de cada tipo, como a conferência precisa. */
export async function obterPastasPorTipo(): Promise<Record<TipoArquivoDerivado, string | null>> {
  const config = await buscarConfigConferenciaDerivados();

  return {
    pdf: config.pastaPdf,
    dxf: config.pastaDxf,
    step: config.pastaStep,
  };
}
