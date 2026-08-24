import "server-only";

export interface EstatisticasSistema {
  uptimeSegundos: number;
  memoriaUsadaMB: number;
  memoriaTotalMB: number;
  nodeVersion: string;
  ambiente: string;
  pid: number;
}

/*
 * Só o processo Node.js — não é o mesmo servidor físico do SQL
 * Server (ver obterEstatisticasBanco). Síncrono, não precisa de
 * banco nem de rede.
 */
export function obterEstatisticasSistema(): EstatisticasSistema {
  const memoria = process.memoryUsage();

  return {
    uptimeSegundos: Math.floor(process.uptime()),
    memoriaUsadaMB: Math.round(memoria.rss / (1024 * 1024)),
    memoriaTotalMB: Math.round(memoria.heapTotal / (1024 * 1024)),
    nodeVersion: process.version,
    ambiente: process.env.NODE_ENV ?? "desconhecido",
    pid: process.pid,
  };
}
