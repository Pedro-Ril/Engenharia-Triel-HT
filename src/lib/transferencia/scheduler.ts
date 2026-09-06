import "server-only";

import { limparTransferenciasExpiradas } from "./transferencias";

/*
 * Checa a cada 15 minutos se alguma transferência já passou do prazo
 * escolhido por quem enviou — apaga o arquivo do disco e a linha do
 * banco. Mesmo padrão de `src/lib/materias-primas/scheduler.ts`
 * (`setInterval` fixo + flag em `global` pra sobreviver a múltiplas
 * chamadas de `register()`).
 */
const INTERVALO_VERIFICACAO_MS = 15 * 60 * 1000;

let limpandoAgora = false;

async function verificarELimpar() {
  if (limpandoAgora) return;
  limpandoAgora = true;

  try {
    await limparTransferenciasExpiradas();
  } catch (error) {
    console.error("Erro no agendador de limpeza de transferências:", error);
  } finally {
    limpandoAgora = false;
  }
}

declare global {
  var engTransferenciaSchedulerIniciado: boolean | undefined;
}

export function iniciarLimpezaTransferencias() {
  if (global.engTransferenciaSchedulerIniciado) return;
  global.engTransferenciaSchedulerIniciado = true;

  setInterval(() => {
    verificarELimpar().catch((error) => {
      console.error("Erro inesperado no agendador de transferências:", error);
    });
  }, INTERVALO_VERIFICACAO_MS);
}
