import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, requiredText } from "@/lib/auth/validation";
import {
  criarBlocoTipo,
  listarBlocosDoTipo,
} from "@/lib/estoque-equipamentos-usados/tipos-equipamento";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function handleGET(request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  try {
    const blocos = await listarBlocosDoTipo(id);
    return NextResponse.json({ ok: true, data: blocos });
  } catch (error) {
    console.error("Erro ao listar blocos do tipo de equipamento:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar os blocos." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/estoque-equipamentos-usados/tipos/[id]/blocos", handleGET);

async function handlePOST(request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  try {
    const parsedBody: unknown = await request.json();
    if (!isObject(parsedBody)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }

    const nome = requiredText(parsedBody.nome, "nome", 100);
    const bloco = await criarBlocoTipo(id, nome);

    return NextResponse.json({ ok: true, message: "Bloco criado.", data: bloco }, { status: 201 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao criar bloco do tipo de equipamento:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível criar o bloco." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("admin/estoque-equipamentos-usados/tipos/[id]/blocos", handlePOST);
