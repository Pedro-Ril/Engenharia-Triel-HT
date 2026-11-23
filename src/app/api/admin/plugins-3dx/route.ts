import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { buscarVisaoGeral, ehAmbiente } from "@/lib/plugins-3dx/plugins-3dx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ?ambiente=PRODUCAO|TESTE; sem o parâmetro (ou outro valor) = os dois. */
async function handleGET(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const ambiente = new URL(request.url).searchParams.get("ambiente");
  try {
    return NextResponse.json({ ok: true, data: await buscarVisaoGeral(ehAmbiente(ambiente) ? ambiente : null) });
  } catch (error) {
    console.error("Erro ao carregar a visão geral dos Plugins 3DX:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível carregar os plugins (a migração 0172 foi aplicada?)." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/plugins-3dx", handleGET);
