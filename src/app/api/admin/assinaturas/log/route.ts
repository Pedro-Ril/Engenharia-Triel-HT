import { NextResponse } from "next/server";

import { listarLogAdmin } from "@/lib/assinaturas/geradas";
import { requireAdminApi } from "@/lib/auth/autorizacao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const params = new URL(request.url).searchParams;
    const pagina = Math.max(1, Number(params.get("pagina")) || 1);
    const porPagina = Math.min(100, Math.max(1, Number(params.get("porPagina")) || 20));
    const busca = params.get("busca") || undefined;
    const modeloNome = params.get("modeloNome") || undefined;

    const resultado = await listarLogAdmin(pagina, porPagina, { busca, modeloNome });

    return NextResponse.json({ ok: true, data: resultado });
  } catch (error) {
    console.error("Erro ao listar log de assinaturas:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível carregar o log." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/assinaturas/log", handleGET);
