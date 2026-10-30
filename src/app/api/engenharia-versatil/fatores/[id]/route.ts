import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { requiredUuidArray } from "@/lib/auth/validation";
import { buscarGravacaoFator } from "@/lib/engenharia-versatil/fator-conversao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/* Uma gravação de fatores (ou ajuste de peso) com o antes/depois de cada item. */
async function handleGET(_request: Request, context: RouteContext) {
  const acesso = await verificarAcessoModuloApi("engenharia-versatil");
  if (acesso.negado) return acesso.negado;

  try {
    const { id } = await context.params;
    const gravacao = await buscarGravacaoFator(requiredUuidArray([id], "gravação")[0]);
    if (!gravacao) return NextResponse.json({ ok: false, message: "Gravação não encontrada." }, { status: 404 });
    return NextResponse.json({ ok: true, data: gravacao });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    console.error("Erro ao buscar a gravação de fatores:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível buscar a gravação." }, { status: 500 });
  }
}

export const GET = comMetricasApi("engenharia-versatil/fatores/[id]", handleGET);
