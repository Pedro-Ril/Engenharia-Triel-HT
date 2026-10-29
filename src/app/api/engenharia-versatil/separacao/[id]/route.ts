import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { requiredUuidArray } from "@/lib/auth/validation";
import { buscarSeparacao } from "@/lib/engenharia-versatil/separacao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/* Uma separação com o resultado de cada arquivo. */
async function handleGET(_request: Request, context: RouteContext) {
  const acesso = await verificarAcessoModuloApi("engenharia-versatil");
  if (acesso.negado) return acesso.negado;

  try {
    const { id } = await context.params;
    const separacao = await buscarSeparacao(requiredUuidArray([id], "separação")[0]);
    if (!separacao) return NextResponse.json({ ok: false, message: "Separação não encontrada." }, { status: 404 });
    return NextResponse.json({ ok: true, data: separacao });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    console.error("Erro ao buscar a separação da Engenharia Versátil:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível buscar a separação." }, { status: 500 });
  }
}

export const GET = comMetricasApi("engenharia-versatil/separacao/[id]", handleGET);
