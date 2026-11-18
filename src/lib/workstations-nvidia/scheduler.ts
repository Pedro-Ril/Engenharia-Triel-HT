import "server-only";

import { coletaEmAndamento, coletarMaquinas } from "./coleta";
import { buscarConfiguracaoNvidia } from "./config";

/*
 * Coleta automática do status das workstations NVIDIA — mesmo padrão
 * dos outros agendadores do portal (setInterval fixo + intervalo
 * configurável lido a cada tick): checa a cada minuto se já passou o
 * intervalo configurado em Administração → Workstations NVIDIA →
 * Configurações desde a última coleta automática. A primeira roda
 * cerca de 1 minuto depois que o servidor sobe.
 */
const INTERVALO_VERIFICACAO_MS = 60 * 1000;

declare global {
  var wsNvidiaSchedulerIniciado: boolean | undefined;
  var wsNvidiaUltimaColetaAgendadaMs: number | undefined;
}

async function verificarEColetar() {
  if (coletaEmAndamento()) return;

  const config = await buscarConfiguracaoNvidia();
  if (!config.coletaAtiva) return;

  const ultima = global.wsNvidiaUltimaColetaAgendadaMs ?? 0;
  if (Date.now() - ultima < config.intervaloMinutos * 60 * 1000) return;

  global.wsNvidiaUltimaColetaAgendadaMs = Date.now();
  await coletarMaquinas();
}

export function iniciarAgendadorWorkstationsNvidia() {
  if (global.wsNvidiaSchedulerIniciado) return;
  global.wsNvidiaSchedulerIniciado = true;

  setInterval(() => {
    verificarEColetar().catch((error) => {
      console.error("Erro no agendador de Workstations NVIDIA:", error);
    });
  }, INTERVALO_VERIFICACAO_MS);
}
