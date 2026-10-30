import "server-only";

import { buscarConfigErpEstoqueUsados, marcarUltimaExecucaoExtrato } from "./erp-integracao";
import { sincronizarExtrato } from "./extrato-integracao";

/*
 * Sincronização periódica pelo extrato do item no ERP -- mesmo desenho do
 * agendador da NF de entrada (nf-entrada-scheduler.ts): um tick curto que
 * só roda quando já passou o intervalo configurado (padrão 60 min) desde a
 * última execução. Sem URL do extrato configurada, não faz nada.
 */
const INTERVALO_VERIFICACAO_MS = 60 * 1000;

let executandoAgora = false;

async function verificarESeNecessarioExecutar() {
  if (executandoAgora) return;
  executandoAgora = true;

  try {
    const config = await buscarConfigErpEstoqueUsados();
    const url = config.usarAmbienteTeste ? config.urlExtratoTeste : config.urlExtrato;
    if (!url) return;

    const ultimaMs = config.ultimaExecucaoExtratoEm ? new Date(config.ultimaExecucaoExtratoEm).getTime() : 0;
    if (Date.now() - ultimaMs < config.intervaloExtratoMinutos * 60 * 1000) return;

    await marcarUltimaExecucaoExtrato();
    await sincronizarExtrato({ disparadoPor: null });
  } catch (error) {
    console.error("Erro no agendador do extrato do ERP (equipamentos usados):", error);
  } finally {
    executandoAgora = false;
  }
}

declare global {
  var engEstoqueExtratoSchedulerIniciado: boolean | undefined;
}

export function iniciarAgendadorExtratoErp() {
  if (global.engEstoqueExtratoSchedulerIniciado) return;
  global.engEstoqueExtratoSchedulerIniciado = true;

  setInterval(() => {
    verificarESeNecessarioExecutar().catch((error) => {
      console.error("Erro inesperado no agendador do extrato do ERP:", error);
    });
  }, INTERVALO_VERIFICACAO_MS);
}
