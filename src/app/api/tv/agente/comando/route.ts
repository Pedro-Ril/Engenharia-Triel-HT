import { NextResponse } from "next/server";

import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { consumirComandoPendente, requireTerminalApi } from "@/lib/tv/terminais";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Consultada num ciclo bem mais curto que /api/tv/agente/config (ver
 * INTERVALO_VERIFICAR_COMANDO_MS em tv-agente/agente.mjs) — só devolve
 * (e limpa) o comando pendente pra este terminal, sem telemetria nem
 * checagem de hash, pra "Reiniciar terminal"/"Atualizar agente" (ver
 * solicitarComandoAgente) chegarem em segundos em vez de esperar o
 * próximo ciclo de 5min. Continua sendo pull-based (o agente ainda
 * precisa estar de pé e com rede pra pegar o comando) — não resgata um
 * agente travado.
 */
async function handleGET(request: Request) {
  const acesso = await requireTerminalApi(request);
  if (acesso.negado) return acesso.negado;

  try {
    const comando = await consumirComandoPendente(acesso.terminal.id);
    return NextResponse.json({ ok: true, data: { comando } });
  } catch (error) {
    console.error("Erro ao consultar comando pendente de terminal de TV:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível consultar o comando pendente." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("tv/agente/comando", handleGET);
