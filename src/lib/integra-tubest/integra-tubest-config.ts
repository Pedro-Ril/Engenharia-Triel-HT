import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";
import { ValidationError } from "@/lib/auth/errors";

/*
 * Configuração da Integração TuBest. Tabela própria, separada da
 * integra_lantek_config: o endpoint, o token e a pasta são outros, e
 * misturar os dois faria a checagem de "está tudo configurado?" de um
 * módulo depender dos campos do outro.
 */

export interface ConfigIntegraTubest {
  foccoApiBaseUrl: string | null;
  foccoApiChave: string | null;
  tokenConfigurado: boolean;
  pastaStep: string | null;
  atualizadoEm: string | null;
  atualizadoPor: string | null;
}

/*
 * Usada só pela tela de administração — nunca devolve o token cru pro
 * navegador, só se ele está configurado ou não (mesmo padrão de
 * ConfiguracaoAd.senhaConfigurada).
 */
export async function buscarConfigIntegraTubest(): Promise<ConfigIntegraTubest> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<{
    focco_api_base_url: string | null;
    focco_api_chave: string | null;
    focco_api_token: string | null;
    pasta_step: string | null;
    atualizado_em: string | null;
    atualizado_por: string | null;
  }>(`
    SELECT
      [focco_api_base_url],
      [focco_api_chave],
      [focco_api_token],
      [pasta_step],
      CONVERT(VARCHAR(33), [atualizado_em], 126) AS [atualizado_em],
      [atualizado_por]
    FROM dbo.integra_tubest_config
    WHERE [id] = 1;
  `);

  const row = result.recordset[0];

  return {
    foccoApiBaseUrl: row?.focco_api_base_url ?? null,
    foccoApiChave: row?.focco_api_chave ?? null,
    tokenConfigurado: Boolean(row?.focco_api_token),
    pastaStep: row?.pasta_step ?? null,
    atualizadoEm: row?.atualizado_em ?? null,
    atualizadoPor: row?.atualizado_por ?? null,
  };
}

export async function salvarConfigIntegraTubest(params: {
  foccoApiBaseUrl: string | null;
  foccoApiChave: string | null;
  /* undefined/vazio = mantém o token já salvo — só troca quando vier um valor novo. */
  foccoApiToken?: string | null;
  pastaStep: string | null;
  atualizadoPor: string;
}): Promise<ConfigIntegraTubest> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("foccoApiBaseUrl", sql.NVarChar(300), params.foccoApiBaseUrl);
  request.input("foccoApiChave", sql.NVarChar(50), params.foccoApiChave);
  request.input("pastaStep", sql.NVarChar(300), params.pastaStep);
  request.input("atualizadoPor", sql.NVarChar(150), params.atualizadoPor);

  const trocarToken = Boolean(params.foccoApiToken);
  request.input("foccoApiToken", sql.NVarChar(1000), params.foccoApiToken ?? null);
  request.input("trocarToken", sql.Bit, trocarToken);

  await request.query(`
    MERGE dbo.integra_tubest_config AS destino
    USING (SELECT 1 AS [id]) AS origem
    ON destino.[id] = origem.[id]
    WHEN MATCHED THEN
      UPDATE SET
        [focco_api_base_url] = @foccoApiBaseUrl,
        [focco_api_chave] = @foccoApiChave,
        [focco_api_token] = CASE WHEN @trocarToken = 1 THEN @foccoApiToken ELSE destino.[focco_api_token] END,
        [pasta_step] = @pastaStep,
        [atualizado_em] = SYSDATETIME(),
        [atualizado_por] = @atualizadoPor
    WHEN NOT MATCHED THEN
      INSERT ([id], [focco_api_base_url], [focco_api_chave], [focco_api_token], [pasta_step], [atualizado_em], [atualizado_por])
      VALUES (1, @foccoApiBaseUrl, @foccoApiChave, @foccoApiToken, @pastaStep, SYSDATETIME(), @atualizadoPor);
  `);

  return buscarConfigIntegraTubest();
}

/*
 * A conferência de STEP só depende da pasta -- exigir endpoint e token
 * aqui deixaria a tela inútil enquanto o endpoint não existe, sendo que
 * conferir arquivo não fala com o Focco.
 */
export async function obterPastaStep(): Promise<string> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<{ pasta_step: string | null }>(`
    SELECT [pasta_step] FROM dbo.integra_tubest_config WHERE [id] = 1;
  `);

  const pasta = result.recordset[0]?.pasta_step;

  if (!pasta) {
    throw new ValidationError(
      "Configure a pasta de STEP da Integração TuBest em Administração → Configurações."
    );
  }

  return pasta;
}

export interface ConfigParaRotasIntegraTubest {
  foccoApiBaseUrl: string;
  foccoApiChave: string;
  foccoApiToken: string;
  pastaStep: string;
}

/*
 * Só chamada de dentro das rotas — devolve os valores crus (token
 * incluso), diferente de buscarConfigIntegraTubest(), que é pra tela de
 * admin e nunca expõe o token. Lança ValidationError se algo
 * obrigatório ainda não foi configurado.
 */
export async function obterConfigParaRotasTubest(): Promise<ConfigParaRotasIntegraTubest> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<{
    focco_api_base_url: string | null;
    focco_api_chave: string | null;
    focco_api_token: string | null;
    pasta_step: string | null;
  }>(`
    SELECT [focco_api_base_url], [focco_api_chave], [focco_api_token], [pasta_step]
    FROM dbo.integra_tubest_config
    WHERE [id] = 1;
  `);

  const row = result.recordset[0];

  if (!row?.focco_api_base_url || !row.focco_api_chave || !row.focco_api_token || !row.pasta_step) {
    throw new ValidationError(
      "Configure a Integração TuBest em Administração → Configurações antes de usar esta ferramenta."
    );
  }

  return {
    foccoApiBaseUrl: row.focco_api_base_url,
    foccoApiChave: row.focco_api_chave,
    foccoApiToken: row.focco_api_token,
    pastaStep: row.pasta_step,
  };
}
