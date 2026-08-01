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

const sqlServerConfig: SqlConfig = {
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

declare global {
  var portalSqlServerPool:
    | Promise<ConnectionPool>
    | undefined;
}

export function getSqlServerPool() {
  if (!global.portalSqlServerPool) {
    const pool = new sql.ConnectionPool(
      sqlServerConfig
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