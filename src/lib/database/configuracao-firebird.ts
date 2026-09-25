import "server-only";

import fs from "node:fs";
import path from "node:path";

import Firebird from "node-firebird";

import { resetFirebirdPool } from "./firebird";

/*
 * Espelha src/lib/database/configuracao-db.ts, mas SEM o gate de
 * "só salva se o teste passar" nem o botão de reiniciar a aplicação
 * inteira: o Firebird não é uma dependência de boot do portal (só
 * alimenta o módulo de Aprovações), então salvar aqui só precisa
 * reescrever o .env e reciclar o pool lazy (ver resetFirebirdPool) --
 * mesmo espírito de configuracao-smtp, que também é uma integração
 * "opcional" do ponto de vista do portal como um todo.
 */
export interface ConfiguracaoFirebirdAtual {
  host: string;
  port: number;
  database: string;
  user: string;
  senhaConfigurada: boolean;
  charset: string;
  role: string;
  poolMin: number;
  poolMax: number;
}

function lerNumeroEnv(valor: string | undefined, padrao: number): number {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : padrao;
}

export function lerConfiguracaoFirebirdAtual(): ConfiguracaoFirebirdAtual {
  return {
    host: process.env.FB_HOST ?? "",
    port: lerNumeroEnv(process.env.FB_PORT, 3050),
    database: process.env.FB_DATABASE ?? "",
    user: process.env.FB_USER ?? "",
    senhaConfigurada: Boolean(process.env.FB_PASSWORD),
    charset: process.env.FB_CHARSET || "UTF8",
    role: process.env.FB_ROLE ?? "",
    poolMin: lerNumeroEnv(process.env.FB_POOL_MIN, 0),
    poolMax: lerNumeroEnv(process.env.FB_POOL_MAX, 10),
  };
}

export interface ResultadoTesteConexaoFirebird {
  conectou: boolean;
  mensagemErro: string | null;
}

/*
 * Conexão isolada (nunca o pool singleton de getFirebirdPool), só pra
 * validar credenciais candidatas -- sempre desanexa em seguida,
 * sucesso ou falha.
 */
export async function testarConexaoFirebird(config: {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  charset: string;
  role: string | null;
}): Promise<ResultadoTesteConexaoFirebird> {
  let db: Firebird.Database | null = null;

  try {
    db = await Firebird.attachAsync({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      role: config.role || undefined,
      encoding: (config.charset as Firebird.SupportedCharacterSet) || "UTF8",
      /* ver comentário em src/lib/database/firebird.ts -- mesmo motivo. */
      pluginName: Firebird.AUTH_PLUGIN_LEGACY,
    });

    await db.queryAsync("SELECT 1 FROM RDB$DATABASE");

    return { conectou: true, mensagemErro: null };
  } catch (error) {
    return {
      conectou: false,
      mensagemErro: error instanceof Error ? error.message : "Não foi possível conectar ao Firebird.",
    };
  } finally {
    if (db) {
      try {
        await db.detachAsync();
      } catch {
        /* pode já ter caído sozinho -- nada a fazer. */
      }
    }
  }
}

const CAMPOS_ENV = [
  "FB_HOST",
  "FB_PORT",
  "FB_DATABASE",
  "FB_USER",
  "FB_PASSWORD",
  "FB_CHARSET",
  "FB_ROLE",
  "FB_POOL_MIN",
  "FB_POOL_MAX",
] as const;

/*
 * Reescreve só as linhas FB_* do .env, preservando todo o resto do
 * arquivo -- mesma lógica de salvarConfiguracaoDbNoEnv. `password:
 * null` mantém a senha já gravada. Recicla o pool em seguida (ver
 * resetFirebirdPool) pra próxima consulta já usar os valores novos,
 * sem precisar reiniciar o processo inteiro.
 */
export async function salvarConfiguracaoFirebirdNoEnv(config: {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string | null;
  charset: string;
  role: string;
  poolMin: number;
  poolMax: number;
}): Promise<void> {
  const caminhoEnv = path.join(process.cwd(), ".env");
  const conteudoAtual = fs.readFileSync(caminhoEnv, "utf8");
  const linhas = conteudoAtual.split(/\r?\n/);

  const valores: Partial<Record<(typeof CAMPOS_ENV)[number], string>> = {
    FB_HOST: config.host,
    FB_PORT: String(config.port),
    FB_DATABASE: config.database,
    FB_USER: config.user,
    FB_CHARSET: config.charset,
    FB_ROLE: config.role,
    FB_POOL_MIN: String(config.poolMin),
    FB_POOL_MAX: String(config.poolMax),
  };

  if (config.password) {
    valores.FB_PASSWORD = config.password;
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

  process.env.FB_HOST = config.host;
  process.env.FB_PORT = String(config.port);
  process.env.FB_DATABASE = config.database;
  process.env.FB_USER = config.user;
  if (config.password) process.env.FB_PASSWORD = config.password;
  process.env.FB_CHARSET = config.charset;
  process.env.FB_ROLE = config.role;
  process.env.FB_POOL_MIN = String(config.poolMin);
  process.env.FB_POOL_MAX = String(config.poolMax);

  await resetFirebirdPool();
}
