import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";

export type NivelLog = "info" | "aviso" | "erro";

export interface LogSistema {
  id: string;
  nivel: NivelLog;
  origem: string;
  mensagem: string;
  detalhes: string | null;
  metodo: string | null;
  caminho: string | null;
  ipOrigem: string | null;
  criadoEm: string;
}

export interface FiltrosLogs {
  nivel?: NivelLog;
  origem?: string;
  busca?: string;
  pagina: number;
  porPagina: number;
}

/*
 * Nunca lança — chamada principalmente de dentro de
 * src/instrumentation.ts (onRequestError), que já está lidando
 * com um erro; se o próprio registro de log falhar, só vai pro
 * console, não pode derrubar mais nada.
 */
export async function registrarLog(params: {
  nivel: NivelLog;
  origem: string;
  mensagem: string;
  detalhes?: string | null;
  metodo?: string | null;
  caminho?: string | null;
  ipOrigem?: string | null;
}): Promise<void> {
  try {
    const pool = await getSqlServerPool();
    const request = pool.request();

    request.input("nivel", sql.VarChar(10), params.nivel);
    request.input("origem", sql.NVarChar(200), params.origem.slice(0, 200));
    request.input("mensagem", sql.NVarChar(2000), params.mensagem.slice(0, 2000));
    request.input("detalhes", sql.NVarChar(sql.MAX), params.detalhes ?? null);
    request.input("metodo", sql.VarChar(10), params.metodo ?? null);
    request.input("caminho", sql.NVarChar(500), params.caminho?.slice(0, 500) ?? null);
    request.input("ipOrigem", sql.VarChar(64), params.ipOrigem ?? null);

    await request.query(`
      INSERT INTO dbo.portal_logs ([nivel], [origem], [mensagem], [detalhes], [metodo], [caminho], [ip_origem])
      VALUES (@nivel, @origem, @mensagem, @detalhes, @metodo, @caminho, @ipOrigem);
    `);
  } catch (error) {
    console.error("Erro ao registrar log de sistema:", error);
  }
}

interface LogRow {
  id: string;
  nivel: NivelLog;
  origem: string;
  mensagem: string;
  detalhes: string | null;
  metodo: string | null;
  caminho: string | null;
  ip_origem: string | null;
  criado_em: Date;
}

function mapearLog(row: LogRow): LogSistema {
  return {
    id: row.id,
    nivel: row.nivel,
    origem: row.origem,
    mensagem: row.mensagem,
    detalhes: row.detalhes,
    metodo: row.metodo,
    caminho: row.caminho,
    ipOrigem: row.ip_origem,
    criadoEm: row.criado_em.toISOString(),
  };
}

export async function listarLogs(
  filtros: FiltrosLogs
): Promise<{ itens: LogSistema[]; total: number }> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  const condicoes: string[] = [];

  if (filtros.nivel) {
    request.input("nivel", sql.VarChar(10), filtros.nivel);
    condicoes.push("[nivel] = @nivel");
  }

  if (filtros.origem) {
    request.input("origem", sql.NVarChar(200), filtros.origem);
    condicoes.push("[origem] = @origem");
  }

  if (filtros.busca) {
    request.input("busca", sql.NVarChar(200), `%${filtros.busca}%`);
    condicoes.push("([mensagem] LIKE @busca OR [caminho] LIKE @busca)");
  }

  const whereClause = condicoes.length > 0 ? `WHERE ${condicoes.join(" AND ")}` : "";

  const offset = (filtros.pagina - 1) * filtros.porPagina;
  request.input("offset", sql.Int, offset);
  request.input("porPagina", sql.Int, filtros.porPagina);

  const [itensResult, totalResult] = await Promise.all([
    request.query<LogRow>(`
      SELECT [id], [nivel], [origem], [mensagem], [detalhes], [metodo], [caminho],
             [ip_origem], [criado_em]
      FROM dbo.portal_logs
      ${whereClause}
      ORDER BY [criado_em] DESC
      OFFSET @offset ROWS FETCH NEXT @porPagina ROWS ONLY;
    `),
    pool
      .request()
      .query<{ total: number }>(
        `SELECT COUNT(*) AS [total] FROM dbo.portal_logs ${whereClause};`
      ),
  ]);

  return {
    itens: itensResult.recordset.map(mapearLog),
    total: totalResult.recordset[0]?.total ?? 0,
  };
}

export async function contarLogsPorNivel(
  horasRecentes: number
): Promise<Record<NivelLog, number>> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("horas", sql.Int, horasRecentes);

  const result = await request.query<{ nivel: NivelLog; total: number }>(`
    SELECT [nivel], COUNT(*) AS [total]
    FROM dbo.portal_logs
    WHERE [criado_em] >= DATEADD(HOUR, -@horas, SYSDATETIME())
    GROUP BY [nivel];
  `);

  const contagem: Record<NivelLog, number> = { info: 0, aviso: 0, erro: 0 };
  for (const row of result.recordset) {
    contagem[row.nivel] = row.total;
  }
  return contagem;
}

export async function listarOrigensDeLogs(): Promise<string[]> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<{ origem: string }>(`
    SELECT DISTINCT [origem] FROM dbo.portal_logs ORDER BY [origem];
  `);

  return result.recordset.map((row) => row.origem);
}

/*
 * Sem isso a tabela cresce pra sempre — chamada sob demanda pelo
 * botão "Limpar logs antigos" da tela de Monitoramento, não
 * automaticamente (evita apagar evidência de um problema em
 * investigação sem o admin decidir).
 */
export async function limparLogsAntigos(diasParaManter: number): Promise<number> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("dias", sql.Int, diasParaManter);

  const result = await request.query(`
    DELETE FROM dbo.portal_logs
    WHERE [criado_em] < DATEADD(DAY, -@dias, SYSDATETIME());
  `);

  return result.rowsAffected[0] ?? 0;
}
