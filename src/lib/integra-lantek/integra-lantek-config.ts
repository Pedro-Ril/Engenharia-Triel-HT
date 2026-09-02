import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";
import { ValidationError } from "@/lib/auth/errors";

export interface ConfigIntegraLantek {
  foccoApiBaseUrl: string | null;
  foccoApiChave: string | null;
  tokenConfigurado: boolean;
  pastaDxf: string | null;
  pastaDesenhos: string | null;
  pastaExportacaoAgro: string | null;
  pastaExportacaoVe: string | null;
  atualizadoEm: string | null;
  atualizadoPor: string | null;
}

/*
 * Usada só pela tela de administração — nunca devolve o token cru pro
 * navegador, só se ele está configurado ou não (mesmo padrão de
 * ConfiguracaoAd.senhaConfigurada).
 */
export async function buscarConfigIntegraLantek(): Promise<ConfigIntegraLantek> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<{
    focco_api_base_url: string | null;
    focco_api_chave: string | null;
    focco_api_token: string | null;
    pasta_dxf: string | null;
    pasta_desenhos: string | null;
    pasta_exportacao_agro: string | null;
    pasta_exportacao_ve: string | null;
    atualizado_em: string | null;
    atualizado_por: string | null;
  }>(`
    SELECT
      [focco_api_base_url],
      [focco_api_chave],
      [focco_api_token],
      [pasta_dxf],
      [pasta_desenhos],
      [pasta_exportacao_agro],
      [pasta_exportacao_ve],
      CONVERT(VARCHAR(33), [atualizado_em], 126) AS [atualizado_em],
      [atualizado_por]
    FROM dbo.integra_lantek_config
    WHERE [id] = 1;
  `);

  const row = result.recordset[0];

  return {
    foccoApiBaseUrl: row?.focco_api_base_url ?? null,
    foccoApiChave: row?.focco_api_chave ?? null,
    tokenConfigurado: Boolean(row?.focco_api_token),
    pastaDxf: row?.pasta_dxf ?? null,
    pastaDesenhos: row?.pasta_desenhos ?? null,
    pastaExportacaoAgro: row?.pasta_exportacao_agro ?? null,
    pastaExportacaoVe: row?.pasta_exportacao_ve ?? null,
    atualizadoEm: row?.atualizado_em ?? null,
    atualizadoPor: row?.atualizado_por ?? null,
  };
}

export async function salvarConfigIntegraLantek(params: {
  foccoApiBaseUrl: string | null;
  foccoApiChave: string | null;
  /* undefined = mantém o token já salvo; string vazia/null também mantém — só troca quando vier um valor novo. */
  foccoApiToken?: string | null;
  pastaDxf: string | null;
  pastaDesenhos: string | null;
  pastaExportacaoAgro: string | null;
  pastaExportacaoVe: string | null;
  atualizadoPor: string;
}): Promise<ConfigIntegraLantek> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("foccoApiBaseUrl", sql.NVarChar(300), params.foccoApiBaseUrl);
  request.input("foccoApiChave", sql.NVarChar(50), params.foccoApiChave);
  request.input("pastaDxf", sql.NVarChar(300), params.pastaDxf);
  request.input("pastaDesenhos", sql.NVarChar(300), params.pastaDesenhos);
  request.input("pastaExportacaoAgro", sql.NVarChar(300), params.pastaExportacaoAgro);
  request.input("pastaExportacaoVe", sql.NVarChar(300), params.pastaExportacaoVe);
  request.input("atualizadoPor", sql.NVarChar(150), params.atualizadoPor);

  const trocarToken = Boolean(params.foccoApiToken);
  request.input("foccoApiToken", sql.NVarChar(1000), params.foccoApiToken ?? null);
  request.input("trocarToken", sql.Bit, trocarToken);

  await request.query(`
    MERGE dbo.integra_lantek_config AS destino
    USING (SELECT 1 AS [id]) AS origem
    ON destino.[id] = origem.[id]
    WHEN MATCHED THEN
      UPDATE SET
        [focco_api_base_url] = @foccoApiBaseUrl,
        [focco_api_chave] = @foccoApiChave,
        [focco_api_token] = CASE WHEN @trocarToken = 1 THEN @foccoApiToken ELSE destino.[focco_api_token] END,
        [pasta_dxf] = @pastaDxf,
        [pasta_desenhos] = @pastaDesenhos,
        [pasta_exportacao_agro] = @pastaExportacaoAgro,
        [pasta_exportacao_ve] = @pastaExportacaoVe,
        [atualizado_em] = SYSDATETIME(),
        [atualizado_por] = @atualizadoPor
    WHEN NOT MATCHED THEN
      INSERT (
        [id], [focco_api_base_url], [focco_api_chave], [focco_api_token],
        [pasta_dxf], [pasta_desenhos], [pasta_exportacao_agro], [pasta_exportacao_ve],
        [atualizado_em], [atualizado_por]
      )
      VALUES (
        1, @foccoApiBaseUrl, @foccoApiChave, @foccoApiToken,
        @pastaDxf, @pastaDesenhos, @pastaExportacaoAgro, @pastaExportacaoVe,
        SYSDATETIME(), @atualizadoPor
      );
  `);

  return buscarConfigIntegraLantek();
}

export interface ConfigParaRotasIntegraLantek {
  foccoApiBaseUrl: string;
  foccoApiChave: string;
  foccoApiToken: string;
  pastaDxf: string;
  pastaDesenhos: string;
  pastaExportacaoAgro: string;
  pastaExportacaoVe: string;
}

/*
 * Só chamada de dentro das rotas de API migradas — devolve os valores
 * crus (token incluso), diferente de buscarConfigIntegraLantek() (que é
 * pra tela de admin e nunca expõe o token). Lança ValidationError se
 * algo obrigatório ainda não foi configurado, mesmo padrão do
 * exigirConfig() de Substituição de Estrutura.
 */
export async function obterConfigParaRotas(): Promise<ConfigParaRotasIntegraLantek> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<{
    focco_api_base_url: string | null;
    focco_api_chave: string | null;
    focco_api_token: string | null;
    pasta_dxf: string | null;
    pasta_desenhos: string | null;
    pasta_exportacao_agro: string | null;
    pasta_exportacao_ve: string | null;
  }>(`
    SELECT
      [focco_api_base_url],
      [focco_api_chave],
      [focco_api_token],
      [pasta_dxf],
      [pasta_desenhos],
      [pasta_exportacao_agro],
      [pasta_exportacao_ve]
    FROM dbo.integra_lantek_config
    WHERE [id] = 1;
  `);

  const row = result.recordset[0];

  if (
    !row?.focco_api_base_url ||
    !row.focco_api_chave ||
    !row.focco_api_token ||
    !row.pasta_dxf ||
    !row.pasta_desenhos ||
    !row.pasta_exportacao_agro ||
    !row.pasta_exportacao_ve
  ) {
    throw new ValidationError(
      "Configure a integração Focco x Lantek em Administração → Configurações antes de usar esta ferramenta."
    );
  }

  return {
    foccoApiBaseUrl: row.focco_api_base_url,
    foccoApiChave: row.focco_api_chave,
    foccoApiToken: row.focco_api_token,
    pastaDxf: row.pasta_dxf,
    pastaDesenhos: row.pasta_desenhos,
    pastaExportacaoAgro: row.pasta_exportacao_agro,
    pastaExportacaoVe: row.pasta_exportacao_ve,
  };
}
