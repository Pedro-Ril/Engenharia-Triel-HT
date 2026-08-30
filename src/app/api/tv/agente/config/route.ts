import { NextResponse } from "next/server";

import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { calcularHashAgente } from "@/lib/tv/agente-hash";
import {
  consumirComandoPendente,
  registrarVerificacaoAgenteSemFalhar,
  requireTerminalApi,
} from "@/lib/tv/terminais";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Consultada periodicamente pelo agente nativo já pareado (Bearer
 * token de dispositivo) — devolve o hash do script atual (pra ele
 * decidir se precisa se auto-atualizar, ver tv-agente/agente.mjs) e o
 * caminho inicial configurado pra esse terminal específico (pra trocar
 * a página do kiosk sem precisar de uma atualização de código, só
 * mudando o campo em Dispositivos).
 *
 * O agente manda o próprio hash atual em ?hashAtual=, e telemetria
 * básica (IP local, %CPU, %memória) em ?ip=/&cpuPercentual=/&memoriaPercentual=
 * — tudo isso alimenta a coluna "Agente" na tela de Dispositivos
 * (última verificação, atualizado/desatualizado, e os números de uso),
 * um sinal de vida independente do heartbeat do navegador (ver
 * registrarVerificacaoAgenteSemFalhar). IP vem do próprio agente (não
 * do cabeçalho da requisição) de propósito — é o IP de rede local da
 * máquina, útil pra identificar fisicamente o terminal, e nem sempre
 * bate com o que o servidor veria na conexão (ex: atrás de NAT).
 *
 * Também devolve (e limpa) qualquer comando pendente pra este terminal
 * — "reiniciar_maquina"/"atualizar_agente", pedidos pelo admin em
 * Dispositivos (ver solicitarComandoAgente) — executado só no próximo
 * poll do agente, então não resgata um agente travado.
 */
async function handleGET(request: Request) {
  const acesso = await requireTerminalApi(request);
  if (acesso.negado) return acesso.negado;

  try {
    const params = new URL(request.url).searchParams;
    const hashAtual = params.get("hashAtual");

    if (hashAtual) {
      const cpuPercentual = params.get("cpuPercentual");
      const memoriaPercentual = params.get("memoriaPercentual");

      await registrarVerificacaoAgenteSemFalhar(acesso.terminal.id, hashAtual, {
        ip: params.get("ip"),
        cpuPercentual: cpuPercentual ? Number(cpuPercentual) : null,
        memoriaPercentual: memoriaPercentual ? Number(memoriaPercentual) : null,
        sistemaOperacional: params.get("sistemaOperacional"),
      });
    }

    const hash = await calcularHashAgente();
    const comando = await consumirComandoPendente(acesso.terminal.id);

    return NextResponse.json({
      ok: true,
      data: {
        hash,
        caminhoInicial: acesso.terminal.caminhoInicial || "/tv",
        comando,
      },
    });
  } catch (error) {
    console.error("Erro ao calcular configuração do agente de TV:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível obter a configuração do agente." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("tv/agente/config", handleGET);
