import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { listarCamposDoTipo } from "@/lib/estoque-equipamentos-usados/tipos-equipamento";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function handleGET(request: Request, context: RouteContext) {
  const acesso = await verificarAcessoModuloApi("estoque-equipamentos-usados");
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  try {
    const campos = await listarCamposDoTipo(id, true);
    return NextResponse.json({ ok: true, data: campos });
  } catch (error) {
    console.error("Erro ao listar campos ativos do tipo de equipamento:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar os campos." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("estoque-equipamentos-usados/tipos/[id]/campos", handleGET);
