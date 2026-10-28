import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { requiredUuidArray } from "@/lib/auth/validation";
import { excluirAlcada, lerCorpoAlcada, salvarAlcada } from "@/lib/aprovacoes/alcadas/config";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function handlePUT(request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const { id } = await context.params;
    const [alcadaId] = requiredUuidArray([id], "alçada");
    const alcada = await salvarAlcada(lerCorpoAlcada(await request.json(), alcadaId), acesso.usuario);
    return NextResponse.json({ ok: true, message: "Alçada salva.", data: alcada });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao salvar a alçada:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível salvar a alçada." }, { status: 500 });
  }
}

export const PUT = comMetricasApi("admin/aprovacoes/alcadas/[id]", handlePUT);

/* Remove a regra; o que já está na fila continua com a cadeia que tinha. */
async function handleDELETE(_request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const { id } = await context.params;
    const [alcadaId] = requiredUuidArray([id], "alçada");
    await excluirAlcada(alcadaId, acesso.usuario);
    return NextResponse.json({ ok: true, message: "Alçada removida." });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao remover a alçada:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível remover a alçada." }, { status: 500 });
  }
}

export const DELETE = comMetricasApi("admin/aprovacoes/alcadas/[id]", handleDELETE);
