import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { listarAtividadeRecente } from "@/lib/monitoramento/atividade";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const url = new URL(request.url);
  const pagina = Math.max(1, Number(url.searchParams.get("pagina")) || 1);
  const porPagina = Math.min(50, Math.max(1, Number(url.searchParams.get("porPagina")) || 8));

  try {
    const { itens, total } = await listarAtividadeRecente({ pagina, porPagina });
    return NextResponse.json({ ok: true, data: { itens, total } });
  } catch (error) {
    console.error("Erro ao listar atividade recente:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível carregar a atividade recente." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/monitoramento/atividade", handleGET);
