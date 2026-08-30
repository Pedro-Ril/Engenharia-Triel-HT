import { NextResponse } from "next/server";

import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { buscarConfigTv } from "@/lib/tv/config";
import { deveTransmitir, requireTerminalApi } from "@/lib/tv/terminais";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET(request: Request) {
  const acesso = await requireTerminalApi(request);
  if (acesso.negado) return acesso.negado;

  try {
    const transmitir = await deveTransmitir(acesso.terminal.id);

    if (!transmitir) {
      return NextResponse.json({ ok: true, data: { transmitir: false } });
    }

    const config = await buscarConfigTv();

    if (!config.signalingUrl) {
      return NextResponse.json({ ok: true, data: { transmitir: false } });
    }

    return NextResponse.json({
      ok: true,
      data: { transmitir: true, signalingUrl: config.signalingUrl },
    });
  } catch (error) {
    console.error("Erro ao verificar solicitação de transmissão de terminal de TV:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível verificar a transmissão." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("tv/deve-transmitir", handleGET);
