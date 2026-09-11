import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { listarBlocosDoTipo } from "@/lib/estoque-equipamentos-usados/tipos-equipamento";
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
    const blocos = await listarBlocosDoTipo(id, true);
    return NextResponse.json({ ok: true, data: blocos });
  } catch (error) {
    console.error("Erro ao listar blocos ativos do tipo de equipamento:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar os blocos." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("estoque-equipamentos-usados/tipos/[id]/blocos", handleGET);
