import { NextResponse } from "next/server";

import { listarDownloadsPublicos } from "@/lib/downloads/downloads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const downloads = await listarDownloadsPublicos();
    return NextResponse.json({ ok: true, data: downloads });
  } catch (error) {
    console.error("Erro ao listar downloads:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível carregar os downloads." },
      { status: 500 }
    );
  }
}
