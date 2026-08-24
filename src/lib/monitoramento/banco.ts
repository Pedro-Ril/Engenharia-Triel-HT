import "server-only";

import { getSqlServerPool } from "@/lib/database/sql-server";

export interface TabelaBanco {
  nome: string;
  linhas: number;
  tamanhoMB: number;
}

export interface EstatisticasPool {
  conectado: boolean;
  saudavel: boolean;
  tamanho: number;
  disponiveis: number;
  emUso: number;
  pendentes: number;
}

export interface EstatisticasBanco {
  servidor: string;
  banco: string;
  versaoSqlServer: string;
  tamanhoBancoMB: number;
  conexoesAtivas: number;
  horasAtivoServidor: number;
  pool: EstatisticasPool;
  tabelas: TabelaBanco[];
}

interface InfoRow {
  servidor: string;
  banco: string;
  versao: string;
  tamanho_mb: number;
  conexoes_ativas: number;
  horas_ativo: number;
}

interface TabelaRow {
  nome: string;
  linhas: number;
  tamanho_mb: number;
}

/*
 * `sys.dm_os_sys_info`/`sys.dm_exec_sessions` exigem VIEW SERVER
 * STATE — a conta de aplicação usada aqui (sa) sempre tem esse
 * direito, mas uma futura troca de credencial pode não ter; por
 * isso cada bloco é isolado em try/catch com um valor de
 * fallback, em vez de derrubar a tela de monitoramento inteira.
 */
export async function obterEstatisticasBanco(): Promise<EstatisticasBanco> {
  const pool = await getSqlServerPool();

  let info: InfoRow | null = null;
  try {
    const infoResult = await pool.request().query<InfoRow>(`
      SELECT
        CAST(@@SERVERNAME AS NVARCHAR(128)) AS [servidor],
        CAST(DB_NAME() AS NVARCHAR(128)) AS [banco],
        CAST(SERVERPROPERTY('ProductVersion') AS NVARCHAR(50)) AS [versao],
        CAST((
          SELECT SUM(CAST([size] AS BIGINT)) * 8.0 / 1024
          FROM sys.master_files
          WHERE [database_id] = DB_ID()
        ) AS DECIMAL(12, 1)) AS [tamanho_mb],
        (
          SELECT COUNT(*)
          FROM sys.dm_exec_sessions
          WHERE [database_id] = DB_ID() AND [is_user_process] = 1
        ) AS [conexoes_ativas],
        DATEDIFF(HOUR, (SELECT [sqlserver_start_time] FROM sys.dm_os_sys_info), SYSDATETIME()) AS [horas_ativo];
    `);
    info = infoResult.recordset[0] ?? null;
  } catch (error) {
    console.error("Erro ao consultar informações do servidor SQL:", error);
  }

  let tabelas: TabelaRow[] = [];
  try {
    const tabelasResult = await pool.request().query<TabelaRow>(`
      SELECT TOP 12
        t.[name] AS [nome],
        SUM(p.[rows]) AS [linhas],
        CAST(SUM(a.[total_pages]) * 8.0 / 1024 AS DECIMAL(12, 2)) AS [tamanho_mb]
      FROM sys.tables AS t
      INNER JOIN sys.partitions AS p ON p.[object_id] = t.[object_id] AND p.[index_id] IN (0, 1)
      INNER JOIN sys.allocation_units AS a ON a.[container_id] = p.[partition_id]
      WHERE t.[name] LIKE 'portal_%'
      GROUP BY t.[name]
      ORDER BY SUM(a.[total_pages]) DESC;
    `);
    tabelas = tabelasResult.recordset;
  } catch (error) {
    console.error("Erro ao consultar tamanho das tabelas:", error);
  }

  return {
    servidor: info?.servidor ?? "—",
    banco: info?.banco ?? "—",
    versaoSqlServer: info?.versao ?? "—",
    tamanhoBancoMB: info?.tamanho_mb ?? 0,
    conexoesAtivas: info?.conexoes_ativas ?? 0,
    horasAtivoServidor: info?.horas_ativo ?? 0,
    pool: {
      conectado: pool.connected,
      saudavel: pool.healthy,
      tamanho: pool.size,
      disponiveis: pool.available,
      emUso: pool.borrowed,
      pendentes: pool.pending,
    },
    tabelas: tabelas.map((row) => ({
      nome: row.nome,
      linhas: row.linhas,
      tamanhoMB: row.tamanho_mb,
    })),
  };
}
