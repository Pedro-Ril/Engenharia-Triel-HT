import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject } from "@/lib/auth/validation";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { cancelarExecucao, obterExecucao } from "@/lib/plugins-3dx/plugins-3dx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uniqueIdentifierPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Contexto {
  params: Promise<{ id: string }>;
}

async function handleGET(_request: Request, contexto: Contexto) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { id } = await contexto.params;
  if (!uniqueIdentifierPattern.test(id)) {
    return NextResponse.json({ ok: false, message: "Identificador inválido." }, { status: 400 });
  }
  try {
    const detalhe = await obterExecucao(id);
    if (!detalhe) return NextResponse.json({ ok: false, message: "Execução não encontrada." }, { status: 404 });
    return NextResponse.json({ ok: true, data: detalhe });
  } catch (error) {
    console.error("Erro ao carregar a execução do plugin 3DX:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível carregar a execução." }, { status: 500 });
  }
}

/* Única alteração permitida numa execução: cancelar enquanto está pendente. */
async function handlePATCH(request: Request, contexto: Contexto) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { id } = await contexto.params;
  try {
    if (!uniqueIdentifierPattern.test(id)) throw new ValidationError("Identificador inválido.");
    const body: unknown = await request.json().catch(() => null);
    if (!isObject(body) || body.acao !== "cancelar") throw new ValidationError("Ação inválida.");
    await cancelarExecucao(id, acesso.usuario);
    return NextResponse.json({ ok: true, message: "Trabalho cancelado." });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    console.error("Erro ao cancelar a execução do plugin 3DX:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível cancelar." }, { status: 500 });
  }
}

export const GET = comMetricasApi("admin/plugins-3dx/execucoes/id", handleGET);
export const PATCH = comMetricasApi("admin/plugins-3dx/execucoes/id", handlePATCH);
