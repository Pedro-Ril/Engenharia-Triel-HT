import sql from "mssql";

import type {
  config as SqlConfig,
  ConnectionPool,
} from "mssql";

function getRequiredEnvironmentVariable(
  variableName: string
) {
  const value = process.env[variableName];

  if (!value) {
    throw new Error(
      `A variável de ambiente ${variableName} não foi configurada.`
    );
  }

  return value;
}

function getBooleanEnvironmentVariable(
  variableName: string,
  defaultValue: boolean
) {
  const value = process.env[variableName];

  if (value === undefined) {
    return defaultValue;
  }

  return value.toLowerCase() === "true";
}

function getNumberEnvironmentVariable(
  variableName: string,
  defaultValue: number
) {
  const value = Number(process.env[variableName]);

  return Number.isFinite(value)
    ? value
    : defaultValue;
}

/*
 * Só é chamada dentro de getSqlServerPool(), nunca no topo do
 * módulo — assim, só quem realmente tenta usar o SQL Server
 * exige as variáveis de ambiente. Antes disso ser uma função,
 * qualquer arquivo que importasse este módulo (mesmo sem usar
 * o banco) já derrubava a página inteira se DB_SERVER não
 * estivesse configurado — isso passou a acontecer com todo
 * carregamento de página depois que o layout raiz passou a
 * checar sessão/permissões, que também residem no SQL Server.
 */
function getSqlServerConfig(): SqlConfig {
  return {
    server: getRequiredEnvironmentVariable(
      "DB_SERVER"
    ),

    database: getRequiredEnvironmentVariable(
      "DB_DATABASE"
    ),

    user: getRequiredEnvironmentVariable(
      "DB_USER"
    ),

    password: getRequiredEnvironmentVariable(
      "DB_PASSWORD"
    ),

    connectionTimeout:
      getNumberEnvironmentVariable(
        "DB_CONNECTION_TIMEOUT",
        15000
      ),

    requestTimeout:
      getNumberEnvironmentVariable(
        "DB_REQUEST_TIMEOUT",
        30000
      ),

    pool: {
      max: getNumberEnvironmentVariable(
        "DB_POOL_MAX",
        10
      ),

      min: getNumberEnvironmentVariable(
        "DB_POOL_MIN",
        0
      ),

      idleTimeoutMillis:
        getNumberEnvironmentVariable(
          "DB_POOL_IDLE_TIMEOUT",
          30000
        ),
    },

    options: {
      encrypt: getBooleanEnvironmentVariable(
        "DB_ENCRYPT",
        true
      ),

      trustServerCertificate:
        getBooleanEnvironmentVariable(
          "DB_TRUST_SERVER_CERTIFICATE",
          true
        ),
    },
  };
}

declare global {
  var portalSqlServerPool:
    | Promise<ConnectionPool>
    | undefined;
}

export function getSqlServerPool() {
  if (!global.portalSqlServerPool) {
    const pool = new sql.ConnectionPool(
      getSqlServerConfig()
    );

    global.portalSqlServerPool = pool
      .connect()
      .catch((error) => {
        global.portalSqlServerPool = undefined;
        throw error;
      });
  }

  return global.portalSqlServerPool;
}

export { sql };