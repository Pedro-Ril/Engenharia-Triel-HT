import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { listarRubricas } from "@/lib/aprovacoes/rubricas";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Aprovadores das alçadas de pedido de compra e quem tem rubrica cadastrada. */
async function handleGET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    return NextResponse.json({ ok: true, data: await listarRubricas() });
  } catch (error) {
    console.error("Erro ao listar as rubricas:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível listar as rubricas." }, { status: 500 });
  }
}

export const GET = comMetricasApi("admin/aprovacoes/rubricas", handleGET);
