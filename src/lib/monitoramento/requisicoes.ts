import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";

export interface ResumoRotaRequisicoes {
  rota: string;
  totalChamadas: number;
  taxaErro: number;
  latenciaMediaMs: number;
}

export interface ResumoRequisicoes {
  totalChamadas24h: number;
  taxaErro24h: number;
  latenciaMedia24hMs: number;
  porRota: ResumoRotaRequisicoes[];
}

/*
 * Nunca lança — chamada pelo wrapper comMetricasApi (src/lib/monitoramento/metricas.ts)
 * depois de toda requisição a uma rota /api/**. Se o próprio registro
 * falhar, só loga no console; nunca pode atrasar ou derrubar a
 * resposta real que já foi (ou está sendo) enviada ao cliente.
 */
export async function registrarMetricaApiSemFalhar(params: {
  rota: string;
  metodo: string;
  status: number;
  duracaoMs: number;
}): Promise<void> {
  try {
    const pool = await getSqlServerPool();
    const request = pool.request();

    request.input("rota", sql.VarChar(200), params.rota.slice(0, 200));
    request.input("metodo", sql.VarChar(10), params.metodo);
    request.input("status", sql.Int, params.status);
    request.input("duracaoMs", sql.Int, Math.round(params.duracaoMs));

    await request.query(`
      INSERT INTO dbo.portal_monitoramento_requisicoes ([rota], [metodo], [status], [duracao_ms])
      VALUES (@rota, @metodo, @status, @duracaoMs);
    `);
  } catch (error) {
    console.error("Erro ao registrar métrica de requisição de API:", error);
  }
}

export async function obterResumoRequisicoes(): Promise<ResumoRequisicoes> {
  const pool = await getSqlServerPool();

  const [geral, porRota] = await Promise.all([
    pool.request().query<{
      total: number;
      erros: number;
      latenciaMedia: number | null;
    }>(`
      SELECT
        COUNT(*) AS [total],
        SUM(CASE WHEN [status] >= 400 THEN 1 ELSE 0 END) AS [erros],
        AVG(CAST([duracao_ms] AS FLOAT)) AS [latenciaMedia]
      FROM dbo.portal_monitoramento_requisicoes
      WHERE [criado_em] >= DATEADD(HOUR, -24, SYSDATETIME());
    `),
    pool.request().query<{
      rota: string;
      total: number;
      erros: number;
      latenciaMedia: number | null;
    }>(`
      SELECT
        [rota],
        COUNT(*) AS [total],
        SUM(CASE WHEN [status] >= 400 THEN 1 ELSE 0 END) AS [erros],
        AVG(CAST([duracao_ms] AS FLOAT)) AS [latenciaMedia]
      FROM dbo.portal_monitoramento_requisicoes
      WHERE [criado_em] >= DATEADD(HOUR, -24, SYSDATETIME())
      GROUP BY [rota]
      ORDER BY COUNT(*) DESC;
    `),
  ]);

  const linhaGeral = geral.recordset[0];
  const total = linhaGeral?.total ?? 0;

  return {
    totalChamadas24h: total,
    taxaErro24h: total > 0 ? (linhaGeral?.erros ?? 0) / total : 0,
    latenciaMedia24hMs: linhaGeral?.latenciaMedia ? Math.round(linhaGeral.latenciaMedia) : 0,
    porRota: porRota.recordset.map((row) => ({
      rota: row.rota,
      totalChamadas: row.total,
      taxaErro: row.total > 0 ? row.erros / row.total : 0,
      latenciaMediaMs: row.latenciaMedia ? Math.round(row.latenciaMedia) : 0,
    })),
  };
}

/*
 * Sem isso a tabela cresce sem limite (uma linha por requisição) —
 * chamada sob demanda pelo botão "Limpar antigas" da aba APIs, não
 * automaticamente, mesmo padrão de limparLogsAntigos em logs.ts.
 */
export async function limparRequisicoesAntigas(diasParaManter: number): Promise<number> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("dias", sql.Int, diasParaManter);

  const result = await request.query(`
    DELETE FROM dbo.portal_monitoramento_requisicoes
    WHERE [criado_em] < DATEADD(DAY, -@dias, SYSDATETIME());
  `);

  return result.rowsAffected[0] ?? 0;
}
