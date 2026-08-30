import { NextResponse } from "next/server";

import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { consultarPareamento } from "@/lib/tv/terminais";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Chamada pela tela do terminal em polling, antes de ter um token
 * guardado — pública de propósito (o terminal ainda não tem
 * identidade nenhuma no portal neste ponto).
 */
async function handleGET(request: Request) {
  const hardwareId = new URL(request.url).searchParams.get("hardwareId");

  if (!hardwareId || hardwareId.trim().length === 0) {
    return NextResponse.json(
      { ok: false, message: "Informe o identificador de hardware do terminal." },
      { status: 400 }
    );
  }

  try {
    const resultado = await consultarPareamento(hardwareId.trim());
    return NextResponse.json({ ok: true, data: resultado });
  } catch (error) {
    console.error("Erro ao consultar pareamento de terminal de TV:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível consultar o pareamento." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("tv/pareamento", handleGET);
