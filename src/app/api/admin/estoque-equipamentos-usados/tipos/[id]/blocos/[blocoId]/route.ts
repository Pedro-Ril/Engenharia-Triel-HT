import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalBoolean, optionalInteger, optionalText } from "@/lib/auth/validation";
import {
  atualizarBlocoTipo,
  excluirBlocoTipo,
} from "@/lib/estoque-equipamentos-usados/tipos-equipamento";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string; blocoId: string }>;
}

async function handlePATCH(request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { blocoId } = await context.params;

  try {
    const parsedBody: unknown = await request.json();
    if (!isObject(parsedBody)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }

    await atualizarBlocoTipo(blocoId, {
      nome: optionalText(parsedBody.nome, "nome", 100) ?? undefined,
      ordem: parsedBody.ordem === undefined ? undefined : optionalInteger(parsedBody.ordem, "ordem", 0),
      ativo: parsedBody.ativo === undefined ? undefined : optionalBoolean(parsedBody.ativo, "ativo", true),
    });

    return NextResponse.json({ ok: true, message: "Bloco atualizado." });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao atualizar bloco do tipo de equipamento:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível atualizar o bloco." },
      { status: 500 }
    );
  }
}

export const PATCH = comMetricasApi(
  "admin/estoque-equipamentos-usados/tipos/[id]/blocos/[blocoId]",
  handlePATCH
);

async function handleDELETE(request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { blocoId } = await context.params;

  try {
    await excluirBlocoTipo(blocoId);
    return NextResponse.json({ ok: true, message: "Bloco excluído." });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao excluir bloco do tipo de equipamento:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível excluir o bloco." },
      { status: 500 }
    );
  }
}

export const DELETE = comMetricasApi(
  "admin/estoque-equipamentos-usados/tipos/[id]/blocos/[blocoId]",
  handleDELETE
);
