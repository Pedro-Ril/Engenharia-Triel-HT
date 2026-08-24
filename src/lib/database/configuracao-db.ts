import "server-only";

import fs from "node:fs";
import path from "node:path";

import sql from "mssql";

/*
 * Diferente do AD (ver src/lib/auth/configuracao-ad.ts), a conexão
 * do próprio Portal com o SQL Server não pode morar no banco —
 * seria preciso já estar conectado pra ler onde conectar. Continua
 * vindo do `.env` (ver src/lib/database/sql-server.ts); esta tela
 * só lê/edita esse arquivo e testa credenciais candidatas antes de
 * gravar. Trocar o `.env` só vale depois de reiniciar o processo —
 * variável de ambiente é lida uma vez, na subida da aplicação (ver
 * agendarReinicioAplicacao).
 */
export interface ConfiguracaoDbAtual {
  server: string;
  database: string;
  user: string;
  senhaConfigurada: boolean;
  encrypt: boolean;
  trustServerCertificate: boolean;
}

function lerBooleanEnv(valor: string | undefined, padrao: boolean): boolean {
  if (valor === undefined) return padrao;
  return valor.toLowerCase() === "true";
}

export function lerConfiguracaoDbAtual(): ConfiguracaoDbAtual {
  return {
    server: process.env.DB_SERVER ?? "",
    database: process.env.DB_DATABASE ?? "",
    user: process.env.DB_USER ?? "",
    senhaConfigurada: Boolean(process.env.DB_PASSWORD),
    encrypt: lerBooleanEnv(process.env.DB_ENCRYPT, true),
    trustServerCertificate: lerBooleanEnv(process.env.DB_TRUST_SERVER_CERTIFICATE, true),
  };
}

export interface ResultadoTesteConexaoDb {
  conectou: boolean;
  mensagemErro: string | null;
}

/*
 * Abre uma conexão isolada (nunca o pool singleton de
 * getSqlServerPool) só pra validar as credenciais candidatas —
 * fecha em seguida, sucesso ou falha.
 */
export async function testarConexaoDb(config: {
  server: string;
  database: string;
  user: string;
  password: string;
  encrypt: boolean;
  trustServerCertificate: boolean;
}): Promise<ResultadoTesteConexaoDb> {
  const pool = new sql.ConnectionPool({
    server: config.server,
    database: config.database,
    user: config.user,
    password: config.password,
    connectionTimeout: 8000,
    requestTimeout: 8000,
    options: {
      encrypt: config.encrypt,
      trustServerCertificate: config.trustServerCertificate,
    },
  });

  try {
    await pool.connect();
    await pool.request().query("SELECT 1;");
    return { conectou: true, mensagemErro: null };
  } catch (error) {
    return {
      conectou: false,
      mensagemErro:
        error instanceof Error ? error.message : "Não foi possível conectar ao banco de dados.",
    };
  } finally {
    try {
      await pool.close();
    } catch {
      /* pode não ter chegado a conectar — nada a fechar. */
    }
  }
}

const CAMPOS_ENV = [
  "DB_SERVER",
  "DB_DATABASE",
  "DB_USER",
  "DB_PASSWORD",
  "DB_ENCRYPT",
  "DB_TRUST_SERVER_CERTIFICATE",
] as const;

/*
 * Reescreve só as linhas DB_* do .env, preservando todo o resto
 * do arquivo (comentários, outras seções, ordem) — nunca reescreve
 * o arquivo do zero. `password: null` mantém a senha já gravada.
 */
export function salvarConfiguracaoDbNoEnv(config: {
  server: string;
  database: string;
  user: string;
  password: string | null;
  encrypt: boolean;
  trustServerCertificate: boolean;
}): void {
  const caminhoEnv = path.join(process.cwd(), ".env");
  const conteudoAtual = fs.readFileSync(caminhoEnv, "utf8");
  const linhas = conteudoAtual.split(/\r?\n/);

  const valores: Partial<Record<(typeof CAMPOS_ENV)[number], string>> = {
    DB_SERVER: config.server,
    DB_DATABASE: config.database,
    DB_USER: config.user,
    DB_ENCRYPT: String(config.encrypt),
    DB_TRUST_SERVER_CERTIFICATE: String(config.trustServerCertificate),
  };

  if (config.password) {
    valores.DB_PASSWORD = config.password;
  }

  const chavesEncontradas = new Set<string>();

  const novasLinhas = linhas.map((linha) => {
    const match = /^([A-Z_][A-Z0-9_]*)=/.exec(linha);
    if (!match) return linha;

    const chave = match[1] as (typeof CAMPOS_ENV)[number];
    const valor = valores[chave];
    if (valor === undefined) return linha;

    chavesEncontradas.add(chave);
    return `${chave}=${valor}`;
  });

  for (const chave of CAMPOS_ENV) {
    const valor = valores[chave];
    if (valor !== undefined && !chavesEncontradas.has(chave)) {
      novasLinhas.push(`${chave}=${valor}`);
    }
  }

  fs.writeFileSync(caminhoEnv, novasLinhas.join("\n"), "utf8");

  /*
   * Atualiza também o processo atual — assim a tela já reflete o
   * valor salvo, mesmo sabendo que a pool de conexão do banco
   * (getSqlServerPool) só usa esses valores de novo depois que o
   * processo reiniciar.
   */
  process.env.DB_SERVER = config.server;
  process.env.DB_DATABASE = config.database;
  process.env.DB_USER = config.user;
  if (config.password) process.env.DB_PASSWORD = config.password;
  process.env.DB_ENCRYPT = String(config.encrypt);
  process.env.DB_TRUST_SERVER_CERTIFICATE = String(config.trustServerCertificate);
}

/*
 * Não existe supervisor de processo (PM2/serviço) neste ambiente —
 * então isto NÃO é um "reiniciar sozinho": o processo Node
 * simplesmente encerra e alguém precisa subir a aplicação de novo
 * manualmente no servidor. O atraso é só pra a resposta HTTP
 * (confirmando que o encerramento foi agendado) terminar de ser
 * enviada antes do process.exit.
 */
export function agendarReinicioAplicacao(): void {
  setTimeout(() => {
    process.exit(0);
  }, 500);
}
