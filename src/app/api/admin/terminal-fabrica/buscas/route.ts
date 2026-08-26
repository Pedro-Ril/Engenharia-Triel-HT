import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import {
  getResumoBuscasTerminalFabrica,
  listarBuscasTerminalFabrica,
} from "@/lib/auth/terminal-fabrica-buscas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const url = new URL(request.url);
  const pagina = Math.max(1, Number(url.searchParams.get("pagina")) || 1);
  const porPagina = Math.min(100, Math.max(1, Number(url.searchParams.get("porPagina")) || 25));

  try {
    const [{ itens, total }, resumo] = await Promise.all([
      listarBuscasTerminalFabrica({ pagina, porPagina }),
      getResumoBuscasTerminalFabrica(),
    ]);

    return NextResponse.json({ ok: true, data: { buscas: itens, total, resumo } });
  } catch (error) {
    console.error("Erro ao listar buscas do terminal de fábrica:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar as buscas." },
      { status: 500 }
    );
  }
}
