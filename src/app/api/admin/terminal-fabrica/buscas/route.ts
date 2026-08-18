import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import {
  getResumoBuscasTerminalFabrica,
  listarBuscasTerminalFabrica,
} from "@/lib/auth/terminal-fabrica-buscas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const [buscas, resumo] = await Promise.all([
      listarBuscasTerminalFabrica(100),
      getResumoBuscasTerminalFabrica(),
    ]);

    return NextResponse.json({ ok: true, data: { buscas, resumo } });
  } catch (error) {
    console.error("Erro ao listar buscas do terminal de fábrica:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar as buscas." },
      { status: 500 }
    );
  }
}
