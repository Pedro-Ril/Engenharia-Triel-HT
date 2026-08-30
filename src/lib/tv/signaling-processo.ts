import "server-only";

import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";

const PORTA_PADRAO = 3010;

function getPorta(): number {
  return Number(process.env.TV_SIGNALING_PORT) || PORTA_PADRAO;
}

/*
 * Só um processo filho por instância do servidor Next.js — guardado
 * como variável de módulo (não globalThis) porque em produção
 * (`next start`) o módulo é carregado uma única vez, igual aos outros
 * agendadores em processo (ver src/instrumentation.ts).
 */
let processoAtual: ChildProcess | null = null;

export async function signalingEstaOnline(): Promise<boolean> {
  try {
    const resposta = await fetch(`http://127.0.0.1:${getPorta()}/`, {
      signal: AbortSignal.timeout(1500),
    });
    return resposta.ok;
  } catch {
    return false;
  }
}

/*
 * Idempotente: se este processo já tem o filho rodando, ou se já
 * existe algo respondendo naquela porta (outra instância, ou iniciado
 * manualmente via `npm run tv-signaling`), não sobe outro — evita
 * EADDRINUSE. Devolve true se, ao final, o servidor está no ar.
 */
export async function iniciarSignalingSeNecessario(): Promise<boolean> {
  if (processoAtual && processoAtual.exitCode === null && processoAtual.signalCode === null) {
    return true;
  }

  if (await signalingEstaOnline()) {
    return true;
  }

  const caminhoScript = path.join(process.cwd(), "tv-signaling", "server.mjs");

  const processo = spawn(process.execPath, [caminhoScript], {
    env: process.env,
    stdio: "inherit",
  });

  processo.on("exit", (codigo, sinal) => {
    console.error(
      `Servidor de sinalização da TV Corporativa encerrou (código ${codigo}, sinal ${sinal}).`
    );
    if (processoAtual === processo) {
      processoAtual = null;
    }
  });

  processo.on("error", (error) => {
    console.error("Erro ao iniciar o servidor de sinalização da TV Corporativa:", error);
  });

  processoAtual = processo;

  await new Promise((resolve) => setTimeout(resolve, 500));
  return signalingEstaOnline();
}
