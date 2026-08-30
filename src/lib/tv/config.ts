import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";

export interface ConfigTv {
  diretorioMidias: string | null;
  signalingUrl: string | null;
  urlAgente: string | null;
  atualizadoEm: string | null;
  atualizadoPor: string | null;
}

interface ConfigTvRow {
  diretorio_midias: string | null;
  signaling_url: string | null;
  url_agente: string | null;
  atualizado_em: string | null;
  atualizado_por: string | null;
}

const CONFIG_PADRAO: ConfigTv = {
  diretorioMidias: null,
  signalingUrl: null,
  urlAgente: null,
  atualizadoEm: null,
  atualizadoPor: null,
};

export async function buscarConfigTv(): Promise<ConfigTv> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<ConfigTvRow>(`
    SELECT
      [diretorio_midias],
      [signaling_url],
      [url_agente],
      CONVERT(VARCHAR(33), [atualizado_em], 126) AS [atualizado_em],
      [atualizado_por]
    FROM dbo.portal_tv_config
    WHERE [id] = 1;
  `);

  const row = result.recordset[0];
  if (!row) return CONFIG_PADRAO;

  return {
    diretorioMidias: row.diretorio_midias,
    signalingUrl: row.signaling_url,
    urlAgente: row.url_agente,
    atualizadoEm: row.atualizado_em,
    atualizadoPor: row.atualizado_por,
  };
}

export async function salvarConfigTv(params: {
  diretorioMidias: string;
  signalingUrl: string | null;
  urlAgente: string | null;
  atualizadoPor: string;
}): Promise<ConfigTv> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("diretorioMidias", sql.NVarChar(500), params.diretorioMidias);
  request.input("signalingUrl", sql.NVarChar(300), params.signalingUrl);
  request.input("urlAgente", sql.NVarChar(300), params.urlAgente);
  request.input("atualizadoPor", sql.NVarChar(150), params.atualizadoPor);

  await request.query(`
    MERGE INTO dbo.portal_tv_config AS destino
    USING (SELECT 1 AS [id]) AS origem
      ON destino.[id] = origem.[id]
    WHEN MATCHED THEN
      UPDATE SET
        [diretorio_midias] = @diretorioMidias,
        [signaling_url] = @signalingUrl,
        [url_agente] = @urlAgente,
        [atualizado_em] = SYSDATETIME(),
        [atualizado_por] = @atualizadoPor
    WHEN NOT MATCHED THEN
      INSERT ([id], [diretorio_midias], [signaling_url], [url_agente], [atualizado_em], [atualizado_por])
      VALUES (1, @diretorioMidias, @signalingUrl, @urlAgente, SYSDATETIME(), @atualizadoPor);
  `);

  return buscarConfigTv();
}
