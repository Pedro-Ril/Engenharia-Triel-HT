import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { removerRegraEscopo } from "@/lib/aprovacoes/escopo-colaboradores";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function handleDELETE(request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  try {
    await removerRegraEscopo(id);
    return NextResponse.json({ ok: true, message: "Regra removida." });
  } catch (error) {
    console.error("Erro ao remover regra de escopo:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível remover a regra." },
      { status: 500 }
    );
  }
}

export const DELETE = comMetricasApi("admin/aprovacoes/escopo/[id]", handleDELETE);
