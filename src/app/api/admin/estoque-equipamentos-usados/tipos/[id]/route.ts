import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalBoolean, optionalText } from "@/lib/auth/validation";
import {
  atualizarTipoEquipamento,
  excluirTipoEquipamento,
} from "@/lib/estoque-equipamentos-usados/tipos-equipamento";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function handlePATCH(request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  try {
    const parsedBody: unknown = await request.json();
    if (!isObject(parsedBody)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }

    const nome = optionalText(parsedBody.nome, "nome", 150) ?? undefined;
    const ativo =
      parsedBody.ativo === undefined ? undefined : optionalBoolean(parsedBody.ativo, "ativo", true);

    const tipo = await atualizarTipoEquipamento(id, { nome, ativo });

    return NextResponse.json({ ok: true, message: "Tipo de equipamento atualizado.", data: tipo });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao atualizar tipo de equipamento:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível atualizar o tipo de equipamento." },
      { status: 500 }
    );
  }
}

export const PATCH = comMetricasApi("admin/estoque-equipamentos-usados/tipos/[id]", handlePATCH);

async function handleDELETE(request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  try {
    await excluirTipoEquipamento(id);
    return NextResponse.json({ ok: true, message: "Tipo de equipamento excluído." });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao excluir tipo de equipamento:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível excluir o tipo de equipamento." },
      { status: 500 }
    );
  }
}

export const DELETE = comMetricasApi("admin/estoque-equipamentos-usados/tipos/[id]", handleDELETE);
