import "server-only";

import { buscarConfigErpEstoqueUsados, marcarUltimaExecucaoNf } from "./erp-integracao";
import { executarVarreduraNfEntrada } from "./nf-entrada-integracao";

/*
 * Mesmo desenho do agendador de matéria-prima
 * (src/lib/materias-primas/scheduler.ts): um "tick" fixo e curto que só
 * checa se já passou o intervalo configurado desde a última varredura —
 * se sobreviver a um restart do servidor, ele mesmo se realinha (não
 * depende de um setInterval no valor exato configurado, que ficaria
 * defasado assim que o admin trocasse o intervalo).
 */
const INTERVALO_VERIFICACAO_MS = 60 * 1000;

let executandoAgora = false;

async function verificarESeNecessarioExecutar() {
  if (executandoAgora) return;
  executandoAgora = true;

  try {
    const config = await buscarConfigErpEstoqueUsados();
    if (!config.intervaloVerificacaoNfMinutos) return;

    const ultimaMs = config.ultimaExecucaoNfEm ? new Date(config.ultimaExecucaoNfEm).getTime() : 0;
    const intervaloMs = config.intervaloVerificacaoNfMinutos * 60 * 1000;

    if (Date.now() - ultimaMs < intervaloMs) return;

    await marcarUltimaExecucaoNf();
    await executarVarreduraNfEntrada(null);
  } catch (error) {
    console.error("Erro no agendador de NF de entrada (equipamentos usados):", error);
  } finally {
    executandoAgora = false;
  }
}

declare global {
  var engEstoqueNfSchedulerIniciado: boolean | undefined;
}

export function iniciarAgendadorNfEntrada() {
  if (global.engEstoqueNfSchedulerIniciado) return;
  global.engEstoqueNfSchedulerIniciado = true;

  setInterval(() => {
    verificarESeNecessarioExecutar().catch((error) => {
      console.error("Erro inesperado no agendador de NF de entrada:", error);
    });
  }, INTERVALO_VERIFICACAO_MS);
}
