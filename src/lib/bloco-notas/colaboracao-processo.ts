import "server-only";

import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";

import { portaColaboracao } from "./colaboracao";

/*
 * Sobe o serviço de edição ao vivo do Bloco de Notas
 * (colaboracao/server.mjs) junto com o portal -- mesmo esquema do
 * servidor de sinalização da TV (src/lib/tv/signaling-processo.ts).
 */

let processoAtual: ChildProcess | null = null;
let falhasSeguidas = 0;
const MAXIMO_FALHAS_SEGUIDAS = 5;

export async function colaboracaoEstaOnline(): Promise<boolean> {
  try {
    const resposta = await fetch(`http://127.0.0.1:${portaColaboracao()}/`, {
      signal: AbortSignal.timeout(1500),
    });
    return resposta.ok;
  } catch {
    return false;
  }
}

/* Idempotente: se já há algo respondendo na porta (outra instância, ou iniciado à mão), não sobe outro. */
export async function iniciarColaboracaoSeNecessario(): Promise<boolean> {
  if (processoAtual && processoAtual.exitCode === null && processoAtual.signalCode === null) {
    return true;
  }

  if (await colaboracaoEstaOnline()) {
    return true;
  }

  const caminhoScript = path.join(process.cwd(), "colaboracao", "server.mjs");
  const processo = spawn(process.execPath, [caminhoScript], { env: process.env, stdio: "inherit" });
  const iniciadoEm = Date.now();

  processo.on("exit", (codigo, sinal) => {
    console.error(`Serviço de colaboração do Bloco de Notas encerrou (código ${codigo}, sinal ${sinal}).`);
    if (processoAtual === processo) processoAtual = null;

    /*
     * Caiu: religa sozinho em 5 s, sem esperar o portal reiniciar. Se ele
     * cai logo ao subir (erro de configuração, porta tomada) desiste
     * depois de algumas tentativas seguidas, para não ficar em loop.
     */
    falhasSeguidas = Date.now() - iniciadoEm > 60_000 ? 1 : falhasSeguidas + 1;
    if (falhasSeguidas > MAXIMO_FALHAS_SEGUIDAS) {
      console.error("Serviço de colaboração do Bloco de Notas: desisti de religar (caiu várias vezes seguidas).");
      return;
    }
    setTimeout(() => void iniciarColaboracaoSeNecessario(), 5000);
  });

  processo.on("error", (error) => {
    console.error("Erro ao iniciar o serviço de colaboração do Bloco de Notas:", error);
  });

  processoAtual = processo;

  await new Promise((resolve) => setTimeout(resolve, 800));
  return colaboracaoEstaOnline();
}
