import { NextResponse } from "next/server";

import { buscarSlotVigente } from "@/lib/tv/grades";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { requireTerminalApi } from "@/lib/tv/terminais";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET(request: Request) {
  const acesso = await requireTerminalApi(request);
  if (acesso.negado) return acesso.negado;

  if (!acesso.terminal.gradeId) {
    return NextResponse.json({ ok: true, data: null });
  }

  try {
    const slot = await buscarSlotVigente(acesso.terminal.gradeId);
    return NextResponse.json({
      ok: true,
      data: {
        slot,
        intervaloAtualizacaoSegundos: acesso.terminal.intervaloAtualizacaoSegundos,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar grade atual de terminal de TV:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível buscar a programação." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("tv/grade-atual", handleGET);
