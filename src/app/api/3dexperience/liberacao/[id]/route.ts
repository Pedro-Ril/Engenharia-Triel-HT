import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { requiredUuidArray } from "@/lib/auth/validation";
import { buscarRodada } from "@/lib/3dexperience/liberacao-desenhos";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/* Uma rodada com os desenhos. Em processamento, também atualiza o andamento perguntando ao 3DX. */
async function handleGET(_request: Request, context: RouteContext) {
  const acesso = await verificarAcessoModuloApi("3dexperience");
  if (acesso.negado) return acesso.negado;

  try {
    const { id } = await context.params;
    const rodada = await buscarRodada(requiredUuidArray([id], "rodada")[0]);
    if (!rodada) return NextResponse.json({ ok: false, message: "Rodada não encontrada." }, { status: 404 });
    return NextResponse.json({ ok: true, data: rodada });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    console.error("Erro ao buscar a rodada de liberação de desenhos:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível buscar a rodada." }, { status: 500 });
  }
}

export const GET = comMetricasApi("3dexperience/liberacao/[id]", handleGET);
