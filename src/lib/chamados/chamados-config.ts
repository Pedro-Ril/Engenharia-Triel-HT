import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";

export interface ChamadosConfig {
  urlPublica: string | null;
  /* NULL = recurso desligado -- nenhum chamado fecha sozinho (ver src/lib/chamados/scheduler.ts). */
  diasAutoResolucao: number | null;
  atualizadoEm: string | null;
  atualizadoPor: string | null;
}

interface ChamadosConfigRow {
  url_publica: string | null;
  dias_auto_resolucao: number | null;
  atualizado_em: string;
  atualizado_por: string | null;
}

function mapearConfig(row: ChamadosConfigRow): ChamadosConfig {
  return {
    urlPublica: row.url_publica,
    diasAutoResolucao: row.dias_auto_resolucao,
    atualizadoEm: row.atualizado_em,
    atualizadoPor: row.atualizado_por,
  };
}

export async function buscarConfigChamados(): Promise<ChamadosConfig> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<ChamadosConfigRow>(`
    SELECT
      [url_publica],
      [dias_auto_resolucao],
      CONVERT(VARCHAR(33), [atualizado_em], 126) AS [atualizado_em],
      [atualizado_por]
    FROM dbo.portal_chamados_config
    WHERE [id] = 1;
  `);

  const row = result.recordset[0];

  if (!row) {
    return { urlPublica: null, diasAutoResolucao: null, atualizadoEm: null, atualizadoPor: null };
  }

  return mapearConfig(row);
}

export async function salvarConfigChamados(params: {
  urlPublica: string | null;
  diasAutoResolucao: number | null;
  atualizadoPor: string;
}): Promise<ChamadosConfig> {
  const pool = await getSqlServerPool();

  const existente = await pool
    .request()
    .query<{ id: number }>(`SELECT [id] FROM dbo.portal_chamados_config WHERE [id] = 1;`);

  const jaConfigurado = existente.recordset.length > 0;

  const request = pool.request();
  request.input("urlPublica", sql.NVarChar(300), params.urlPublica);
  request.input("diasAutoResolucao", sql.Int, params.diasAutoResolucao);
  request.input("atualizadoPor", sql.NVarChar(150), params.atualizadoPor);

  const query = jaConfigurado
    ? `
      UPDATE dbo.portal_chamados_config
      SET
        [url_publica] = @urlPublica,
        [dias_auto_resolucao] = @diasAutoResolucao,
        [atualizado_em] = SYSDATETIME(),
        [atualizado_por] = @atualizadoPor
      OUTPUT
        INSERTED.[url_publica],
        INSERTED.[dias_auto_resolucao],
        CONVERT(VARCHAR(33), INSERTED.[atualizado_em], 126) AS [atualizado_em],
        INSERTED.[atualizado_por]
      WHERE [id] = 1;
    `
    : `
      INSERT INTO dbo.portal_chamados_config ([id], [url_publica], [dias_auto_resolucao], [atualizado_por])
      OUTPUT
        INSERTED.[url_publica],
        INSERTED.[dias_auto_resolucao],
        CONVERT(VARCHAR(33), INSERTED.[atualizado_em], 126) AS [atualizado_em],
        INSERTED.[atualizado_por]
      VALUES (1, @urlPublica, @diasAutoResolucao, @atualizadoPor);
    `;

  const result = await request.query<ChamadosConfigRow>(query);
  return mapearConfig(result.recordset[0]);
}

/*
 * Mesmo problema já resolvido em Transferência de Arquivos (ver
 * src/lib/transferencia/transferencia-config.ts) e no instalador do
 * agente da TV Corporativa: atrás de proxy reverso que não repassa o
 * Host original, `request.url` vira "http://localhost:3000" mesmo em
 * produção, e o link do e-mail do chamado sai inutilizável fora do
 * próprio servidor. Configurar `url_publica` (Administração →
 * Chamados) resolve sem depender de cabeçalho nenhum do proxy.
 */
export async function origemPublicaEfetivaChamados(request: Request): Promise<string> {
  const config = await buscarConfigChamados();
  return config.urlPublica || new URL(request.url).origin;
}
