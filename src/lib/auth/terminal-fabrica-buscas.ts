import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";

export interface BuscaTerminalFabrica {
  id: string;
  codigoBuscado: string;
  encontrado: boolean;
  buscadoEm: string;
  usuarioNome: string | null;
  ipOrigem: string | null;
}

/*
 * O terminal de fábrica é público (sem login) — não passa por
 * requireModuloAccess, então nunca cai no histórico de acesso
 * por módulo normal. Este é um contador separado, só para as
 * buscas feitas ali. `usuarioId` é opcional: a maioria das
 * buscas é anônima, mas se a pessoa já estiver logada no
 * navegador do terminal, a busca fica nomeada. `ipOrigem` (só
 * IPv4, já normalizado por quem chama — ver extrairIpOrigem em
 * ./login-historico.ts) ajuda a identificar o terminal físico
 * quando não há usuário logado.
 */
export async function registrarBuscaTerminalFabrica(params: {
  usuarioId: string | null;
  codigoBuscado: string;
  encontrado: boolean;
  ipOrigem: string | null;
}): Promise<void> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("usuarioId", sql.UniqueIdentifier, params.usuarioId);
  request.input("codigoBuscado", sql.NVarChar(60), params.codigoBuscado);
  request.input("encontrado", sql.Bit, params.encontrado);
  request.input("ipOrigem", sql.VarChar(64), params.ipOrigem);

  await request.query(`
    INSERT INTO dbo.portal_terminal_fabrica_buscas
      ([usuario_id], [codigo_buscado], [encontrado], [ip_origem])
    VALUES
      (@usuarioId, @codigoBuscado, @encontrado, @ipOrigem);
  `);
}

export async function listarBuscasTerminalFabrica(
  limite = 100
): Promise<BuscaTerminalFabrica[]> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("limite", sql.Int, limite);

  const result = await request.query<{
    id: string;
    codigo_buscado: string;
    encontrado: boolean;
    buscado_em: string;
    usuario_nome: string | null;
    ip_origem: string | null;
  }>(`
    SELECT TOP (@limite)
      CONVERT(VARCHAR(36), b.[id]) AS [id],
      b.[codigo_buscado],
      CAST(b.[encontrado] AS BIT) AS [encontrado],
      CONVERT(VARCHAR(33), b.[buscado_em], 126) AS [buscado_em],
      u.[nome_exibicao] AS [usuario_nome],
      b.[ip_origem]
    FROM dbo.portal_terminal_fabrica_buscas AS b
    LEFT JOIN dbo.portal_usuarios AS u
      ON u.[id] = b.[usuario_id]
    ORDER BY b.[buscado_em] DESC;
  `);

  return result.recordset.map((row) => ({
    id: row.id,
    codigoBuscado: row.codigo_buscado,
    encontrado: row.encontrado,
    buscadoEm: row.buscado_em,
    usuarioNome: row.usuario_nome,
    ipOrigem: row.ip_origem,
  }));
}

export interface ResumoBuscasTerminalFabrica {
  totalBuscas: number;
  buscasHoje: number;
  naoEncontrados: number;
}

export async function getResumoBuscasTerminalFabrica(): Promise<ResumoBuscasTerminalFabrica> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<{
    total_buscas: number;
    buscas_hoje: number;
    nao_encontrados: number;
  }>(`
    SELECT
      COUNT(*) AS [total_buscas],
      SUM(CASE WHEN CAST([buscado_em] AS DATE) = CAST(SYSDATETIME() AS DATE) THEN 1 ELSE 0 END) AS [buscas_hoje],
      SUM(CASE WHEN [encontrado] = 0 THEN 1 ELSE 0 END) AS [nao_encontrados]
    FROM dbo.portal_terminal_fabrica_buscas;
  `);

  const row = result.recordset[0];

  return {
    totalBuscas: row?.total_buscas ?? 0,
    buscasHoje: row?.buscas_hoje ?? 0,
    naoEncontrados: row?.nao_encontrados ?? 0,
  };
}
