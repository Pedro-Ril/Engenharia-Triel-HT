import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { listarSetoresComAceiteChamados } from "@/lib/chamados/atendentes";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const setores = await listarSetoresComAceiteChamados();
    return NextResponse.json({ ok: true, data: setores });
  } catch (error) {
    console.error("Erro ao listar setores para chamados:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar os setores." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/chamados/setores", handleGET);
