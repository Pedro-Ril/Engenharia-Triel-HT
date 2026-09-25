import Firebird from "node-firebird";

/*
 * Espelha o formato de src/lib/database/sql-server.ts (pool lazy num
 * `declare global`, variáveis de ambiente lidas só dentro do getter —
 * nunca no topo do módulo, senão importar este arquivo já derrubaria
 * qualquer página que nem usa Firebird se as variáveis não estiverem
 * configuradas). Único banco Firebird conectado hoje: o ERP/RH (Syspro),
 * acessado só leitura (role RLCONSULTA) pelo módulo de Aprovações.
 */
function getRequiredEnvironmentVariable(variableName: string): string {
  const value = process.env[variableName];

  if (!value) {
    throw new Error(`A variável de ambiente ${variableName} não foi configurada.`);
  }

  return value;
}

function getNumberEnvironmentVariable(variableName: string, defaultValue: number): number {
  const value = Number(process.env[variableName]);

  return Number.isFinite(value) ? value : defaultValue;
}

function getFirebirdOptions(): Firebird.Options {
  return {
    host: getRequiredEnvironmentVariable("FB_HOST"),
    port: getNumberEnvironmentVariable("FB_PORT", 3050),
    database: getRequiredEnvironmentVariable("FB_DATABASE"),
    user: getRequiredEnvironmentVariable("FB_USER"),
    password: getRequiredEnvironmentVariable("FB_PASSWORD"),
    role: process.env.FB_ROLE || undefined,
    encoding: (process.env.FB_CHARSET as Firebird.SupportedCharacterSet) || "UTF8",
    /* min/idleTimeoutMillis existem de verdade nesta versão do driver (ao contrário de versões mais antigas) — mantém um mínimo de conexões vivas. */
    min: getNumberEnvironmentVariable("FB_POOL_MIN", 0),
    /*
     * Este Firebird (3.0.0, /syspro) devolve "Unavailable database" pro
     * usuário USRCONS especificamente durante o handshake SRP (o padrão
     * do driver a partir do protocolo 13) -- confirmado via
     * FIREBIRD_DEBUG=1 que a autenticação em si completa (troca SRP512
     * inteira sem erro), e é só o attach final que o servidor recusa;
     * provavelmente a entrada desse usuário na security.db do servidor
     * nunca foi migrada para guardar o verificador SRP, só o hash
     * legado. Forçar Legacy_Auth (mesmo mecanismo que o Jaybird/DBeaver
     * usa por trás, e que resolveu 100% nos testes) contorna isso sem
     * abrir mão do resto do protocolo moderno (wire compression, etc.).
     */
    pluginName: Firebird.AUTH_PLUGIN_LEGACY,
  };
}

declare global {
  var portalFirebirdPool: Firebird.ConnectionPool | undefined;
}

export function getFirebirdPool(): Firebird.ConnectionPool {
  if (!global.portalFirebirdPool) {
    const max = getNumberEnvironmentVariable("FB_POOL_MAX", 10);
    global.portalFirebirdPool = Firebird.pool(max, getFirebirdOptions());
  }

  return global.portalFirebirdPool;
}

/*
 * Chamado depois de salvar uma configuração nova no .env (ver
 * src/lib/database/configuracao-firebird.ts) -- diferente do SQL
 * Server/AD, cuja troca exige derrubar o processo inteiro (todo mundo
 * depende deles pra logar), o Firebird só alimenta um módulo (
 * Aprovações), então basta destruir o pool antigo e deixar
 * getFirebirdPool recriar com os valores novos no próximo uso, sem
 * afetar mais ninguém no portal.
 */
export async function resetFirebirdPool(): Promise<void> {
  const poolAntigo = global.portalFirebirdPool;
  global.portalFirebirdPool = undefined;

  if (poolAntigo) {
    try {
      await poolAntigo.destroyAsync();
    } catch (error) {
      console.error("Erro ao encerrar o pool antigo do Firebird:", error);
    }
  }
}

/*
 * Só leitura por natureza (role RLCONSULTA no Firebird não permite
 * escrita) — nenhuma função de escrita é criada neste módulo, nem
 * precisa: aprovar/reprovar uma solicitação nunca toca o Firebird.
 */
export function fbQuery<T = unknown>(sqlText: string, params: unknown[] = []): Promise<T[]> {
  return getFirebirdPool().withConnection((db) => db.queryAsync<T>(sqlText, params));
}
