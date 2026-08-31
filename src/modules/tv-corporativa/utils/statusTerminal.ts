import type { TerminalTv } from "../types/tvCorporativa.types";

/*
 * "Online" = heartbeat dentro de uma janela de tolerância — usa 3x o
 * intervalo configurado do próprio terminal (mínimo 60s), já que
 * cada terminal pode ter um intervalo de atualização diferente,
 * diferente do JANELA_ONLINE_MS fixo de ManutencaoPainel.tsx (que é
 * pra atividade humana, não heartbeat de dispositivo).
 */
export function estaOnline(terminal: TerminalTv): boolean {
  if (!terminal.ultimoHeartbeatEm || terminal.revogadoEm) return false;

  const janelaMs = Math.max(60, terminal.intervaloAtualizacaoSegundos * 3) * 1000;
  return Date.now() - new Date(terminal.ultimoHeartbeatEm).getTime() < janelaMs;
}

/*
 * Sinal de vida do PROCESSO do agente nativo (ver
 * INTERVALO_VERIFICAR_CONFIG_MS em tv-agente/agente.mjs, hoje 5min) —
 * independente do heartbeat do navegador acima: um terminal rodando
 * direto no navegador (sem agente) nunca preenche isso, por isso
 * `agenteUltimaVerificacaoEm` null é tratado à parte, não como
 * "offline".
 */
export const AGENTE_INTERVALO_VERIFICACAO_MS = 5 * 60 * 1000;

export function estaAgenteOnline(terminal: TerminalTv): boolean {
  if (!terminal.agenteUltimaVerificacaoEm || terminal.revogadoEm) return false;

  const janelaMs = AGENTE_INTERVALO_VERIFICACAO_MS * 3;
  return Date.now() - new Date(terminal.agenteUltimaVerificacaoEm).getTime() < janelaMs;
}

/*
 * variant da badge de status do agente: verde só quando online E
 * atualizado, laranja quando online mas com uma versão antiga do
 * script (agenteAtualizado === false — null significa "nunca
 * reportou hash", tratado como se estivesse em dia), vermelho quando
 * offline — segue o mesmo padrão de cor (verde/laranja/vermelho) já
 * usado em Badge pros outros status do portal.
 */
export function varianteStatusAgente(terminal: TerminalTv): "success" | "warning" | "danger" {
  if (!estaAgenteOnline(terminal)) return "danger";
  return terminal.agenteAtualizado === false ? "warning" : "success";
}

export function formatarDataHora(dataIso: string): string {
  return new Date(dataIso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" });
}

export function formatarTempoRelativo(dataIso: string): string {
  const diffMs = Date.now() - new Date(dataIso).getTime();
  const diffMinutos = Math.floor(diffMs / 60000);

  if (diffMinutos < 1) return "agora há pouco";
  if (diffMinutos < 60) return `há ${diffMinutos} min`;

  const diffHoras = Math.floor(diffMinutos / 60);
  if (diffHoras < 24) return `há ${diffHoras}h`;

  return `há ${Math.floor(diffHoras / 24)} dias`;
}
