import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";

export interface ConfigSemaforo {
  modoLegado: boolean;
  mediamtxApiUrl: string | null;
  mediamtxWhepBaseUrl: string | null;
  atualizadoEm: string | null;
  atualizadoPor: string | null;
}

interface ConfigSemaforoRow {
  modo_legado: boolean;
  mediamtx_api_url: string | null;
  mediamtx_whep_base_url: string | null;
  atualizado_em: string | null;
  atualizado_por: string | null;
}

/*
 * Sem linha ainda na tabela (nunca foi salva por um admin) — cai pro
 * mesmo default da coluna (modo_legado=1), garantindo que a tela nova
 * só passa a valer depois de alguém desligar a flag de propósito.
 */
const CONFIG_PADRAO: ConfigSemaforo = {
  modoLegado: true,
  mediamtxApiUrl: null,
  mediamtxWhepBaseUrl: null,
  atualizadoEm: null,
  atualizadoPor: null,
};

export async function buscarConfigSemaforo(): Promise<ConfigSemaforo> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<ConfigSemaforoRow>(`
    SELECT
      [modo_legado],
      [mediamtx_api_url],
      [mediamtx_whep_base_url],
      CONVERT(VARCHAR(33), [atualizado_em], 126) AS [atualizado_em],
      [atualizado_por]
    FROM dbo.com_semaforo_config
    WHERE [id] = 1;
  `);

  const row = result.recordset[0];
  if (!row) return CONFIG_PADRAO;

  return {
    modoLegado: row.modo_legado,
    mediamtxApiUrl: row.mediamtx_api_url,
    mediamtxWhepBaseUrl: row.mediamtx_whep_base_url,
    atualizadoEm: row.atualizado_em,
    atualizadoPor: row.atualizado_por,
  };
}

export async function salvarConfigSemaforo(params: {
  modoLegado: boolean;
  mediamtxApiUrl: string | null;
  mediamtxWhepBaseUrl: string | null;
  atualizadoPor: string;
}): Promise<ConfigSemaforo> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("modoLegado", sql.Bit, params.modoLegado);
  request.input("mediamtxApiUrl", sql.NVarChar(300), params.mediamtxApiUrl);
  request.input("mediamtxWhepBaseUrl", sql.NVarChar(300), params.mediamtxWhepBaseUrl);
  request.input("atualizadoPor", sql.NVarChar(150), params.atualizadoPor);

  await request.query(`
    MERGE INTO dbo.com_semaforo_config AS destino
    USING (SELECT 1 AS [id]) AS origem
      ON destino.[id] = origem.[id]
    WHEN MATCHED THEN
      UPDATE SET
        [modo_legado] = @modoLegado,
        [mediamtx_api_url] = @mediamtxApiUrl,
        [mediamtx_whep_base_url] = @mediamtxWhepBaseUrl,
        [atualizado_em] = SYSDATETIME(),
        [atualizado_por] = @atualizadoPor
    WHEN NOT MATCHED THEN
      INSERT ([id], [modo_legado], [mediamtx_api_url], [mediamtx_whep_base_url], [atualizado_em], [atualizado_por])
      VALUES (1, @modoLegado, @mediamtxApiUrl, @mediamtxWhepBaseUrl, SYSDATETIME(), @atualizadoPor);
  `);

  return buscarConfigSemaforo();
}
