import "server-only";

import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";

const API_URL_PADRAO = "http://127.0.0.1:9997";

function getApiUrl(): string {
  return process.env.MEDIAMTX_API_URL || API_URL_PADRAO;
}

/*
 * Só um processo filho por instância do servidor Next.js -- mesmo
 * padrão de src/lib/tv/signaling-processo.ts (variável de módulo, não
 * globalThis, porque em produção o módulo é carregado uma única vez).
 */
let processoAtual: ChildProcess | null = null;

export async function mediamtxEstaOnline(): Promise<boolean> {
  try {
    const resposta = await fetch(`${getApiUrl()}/v3/config/paths/list`, {
      signal: AbortSignal.timeout(1500),
    });
    return resposta.ok;
  } catch {
    return false;
  }
}

/*
 * Idempotente: se este processo já tem o filho rodando, ou se já existe
 * algo respondendo na API (outra instância, ou iniciado manualmente),
 * não sobe outro. MediaMTX é um binário standalone (não uma dependência
 * npm) -- baixado manualmente em mediamtx/mediamtx.exe (git-ignorado),
 * com config em mediamtx/mediamtx.yml (committado, sem segredos).
 */
export async function iniciarMediaMtxSeNecessario(): Promise<boolean> {
  if (processoAtual && processoAtual.exitCode === null && processoAtual.signalCode === null) {
    return true;
  }

  if (await mediamtxEstaOnline()) {
    return true;
  }

  const caminhoExecutavel = path.join(process.cwd(), "mediamtx", "mediamtx.exe");
  const caminhoConfig = path.join(process.cwd(), "mediamtx", "mediamtx.yml");

  /* O caminho da config é um argumento posicional, não uma flag -- "mediamtx.exe --confpath x" falha com "unknown flag --confpath". */
  const processo = spawn(caminhoExecutavel, [caminhoConfig], {
    env: process.env,
    stdio: "inherit",
  });

  processo.on("exit", (codigo, sinal) => {
    console.error(`MediaMTX encerrou (código ${codigo}, sinal ${sinal}).`);
    if (processoAtual === processo) {
      processoAtual = null;
    }
  });

  processo.on("error", (error) => {
    console.error("Erro ao iniciar o MediaMTX (binário ausente em mediamtx/mediamtx.exe?):", error);
  });

  processoAtual = processo;

  await new Promise((resolve) => setTimeout(resolve, 800));
  return mediamtxEstaOnline();
}
