import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { listarTerminais } from "@/lib/tv/terminais";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const terminais = await listarTerminais();
    return NextResponse.json({ ok: true, data: terminais });
  } catch (error) {
    console.error("Erro ao listar terminais de TV:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar os terminais." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/tv/terminais", handleGET);
