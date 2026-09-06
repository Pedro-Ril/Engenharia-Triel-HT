import "server-only";

import { ValidationError } from "@/lib/auth/errors";
import { getSqlServerPool, sql } from "@/lib/database/sql-server";

import { DURACAO_MAXIMA_HORAS_PADRAO } from "./constantes";

export interface TransferenciaConfig {
  pastaArmazenamento: string | null;
  duracaoMaximaHoras: number | null;
  urlPublica: string | null;
  atualizadoEm: string | null;
  atualizadoPor: string | null;
}

interface TransferenciaConfigRow {
  pasta_armazenamento: string;
  duracao_maxima_horas: number | null;
  url_publica: string | null;
  atualizado_em: string;
  atualizado_por: string | null;
}

export async function buscarConfigTransferencia(): Promise<TransferenciaConfig> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<TransferenciaConfigRow>(`
    SELECT
      [pasta_armazenamento],
      [duracao_maxima_horas],
      [url_publica],
      CONVERT(VARCHAR(33), [atualizado_em], 126) AS [atualizado_em],
      [atualizado_por]
    FROM dbo.portal_transferencia_config
    WHERE [id] = 1;
  `);

  const row = result.recordset[0];

  if (!row) {
    return {
      pastaArmazenamento: null,
      duracaoMaximaHoras: null,
      urlPublica: null,
      atualizadoEm: null,
      atualizadoPor: null,
    };
  }

  return {
    pastaArmazenamento: row.pasta_armazenamento,
    duracaoMaximaHoras: row.duracao_maxima_horas,
    urlPublica: row.url_publica,
    atualizadoEm: row.atualizado_em,
    atualizadoPor: row.atualizado_por,
  };
}

export async function pastaArmazenamentoObrigatoria(): Promise<string> {
  const config = await buscarConfigTransferencia();

  if (!config.pastaArmazenamento) {
    throw new ValidationError(
      "Configure a pasta de armazenamento em Administração → Configurações antes de enviar arquivos."
    );
  }

  return config.pastaArmazenamento;
}

export async function duracaoMaximaHorasEfetiva(): Promise<number> {
  const config = await buscarConfigTransferencia();
  return config.duracaoMaximaHoras ?? DURACAO_MAXIMA_HORAS_PADRAO;
}

/*
 * Mesma lógica já usada em TV Corporativa pro instalador do agente
 * (ver src/app/api/tv/agente/instalar.sh/route.ts): `request.url` é o
 * que o Node enxerga por baixo do proxy reverso — se o IIS/Nginx na
 * frente não repassa o Host original, a origem vira algo como
 * "http://localhost:3000" mesmo em produção, e o link gerado fica
 * inutilizável fora do próprio servidor. Configurar
 * `url_publica` (Administração → Configurações → Transferência de
 * Arquivos) resolve isso sem depender de cabeçalho nenhum do proxy.
 */
export async function origemPublicaEfetiva(request: Request): Promise<string> {
  const config = await buscarConfigTransferencia();
  return config.urlPublica || new URL(request.url).origin;
}

export async function salvarConfigTransferencia(params: {
  pastaArmazenamento: string;
  duracaoMaximaHoras: number | null;
  urlPublica: string | null;
  atualizadoPor: string;
}): Promise<TransferenciaConfig> {
  const pool = await getSqlServerPool();

  const existente = await pool
    .request()
    .query<{ id: number }>(`SELECT [id] FROM dbo.portal_transferencia_config WHERE [id] = 1;`);

  const jaConfigurado = existente.recordset.length > 0;

  const request = pool.request();
  request.input("pastaArmazenamento", sql.NVarChar(300), params.pastaArmazenamento);
  request.input("duracaoMaximaHoras", sql.Int, params.duracaoMaximaHoras);
  request.input("urlPublica", sql.NVarChar(300), params.urlPublica);
  request.input("atualizadoPor", sql.NVarChar(150), params.atualizadoPor);

  const query = jaConfigurado
    ? `
      UPDATE dbo.portal_transferencia_config
      SET
        [pasta_armazenamento] = @pastaArmazenamento,
        [duracao_maxima_horas] = @duracaoMaximaHoras,
        [url_publica] = @urlPublica,
        [atualizado_em] = SYSDATETIME(),
        [atualizado_por] = @atualizadoPor
      OUTPUT
        INSERTED.[pasta_armazenamento],
        INSERTED.[duracao_maxima_horas],
        INSERTED.[url_publica],
        CONVERT(VARCHAR(33), INSERTED.[atualizado_em], 126) AS [atualizado_em],
        INSERTED.[atualizado_por]
      WHERE [id] = 1;
    `
    : `
      INSERT INTO dbo.portal_transferencia_config
        ([id], [pasta_armazenamento], [duracao_maxima_horas], [url_publica], [atualizado_por])
      OUTPUT
        INSERTED.[pasta_armazenamento],
        INSERTED.[duracao_maxima_horas],
        INSERTED.[url_publica],
        CONVERT(VARCHAR(33), INSERTED.[atualizado_em], 126) AS [atualizado_em],
        INSERTED.[atualizado_por]
      VALUES (1, @pastaArmazenamento, @duracaoMaximaHoras, @urlPublica, @atualizadoPor);
    `;

  const result = await request.query<TransferenciaConfigRow>(query);
  const row = result.recordset[0];

  return {
    pastaArmazenamento: row.pasta_armazenamento,
    duracaoMaximaHoras: row.duracao_maxima_horas,
    urlPublica: row.url_publica,
    atualizadoEm: row.atualizado_em,
    atualizadoPor: row.atualizado_por,
  };
}
