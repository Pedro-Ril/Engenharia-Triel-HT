import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { listarAparelhosTerminalFabrica } from "@/lib/terminal-fabrica/visualizacao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Aparelhos da TV com a grade do Terminal de Fábrica e em qual app o 3D abre em cada um. */
async function handleGET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    return NextResponse.json({ ok: true, data: await listarAparelhosTerminalFabrica() });
  } catch (error) {
    console.error("Erro ao listar os aparelhos do Terminal de Fábrica:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível listar os aparelhos." }, { status: 500 });
  }
}

export const GET = comMetricasApi("admin/terminal-fabrica/visualizacao", handleGET);
