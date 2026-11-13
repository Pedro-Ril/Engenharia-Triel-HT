import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, requiredText } from "@/lib/auth/validation";
import { atualizarUnidade } from "@/lib/empresas/unidades";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uniqueIdentifierPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteContext {
  params: Promise<{ id: string }>;
}

/* Sem DELETE de propósito: chamados antigos apontam para a unidade -- desativar é o "excluir". */
async function handlePATCH(request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  if (!uniqueIdentifierPattern.test(id)) {
    return NextResponse.json(
      { ok: false, message: "O identificador da unidade é inválido." },
      { status: 400 }
    );
  }

  try {
    const corpo: unknown = await request.json();
    if (!isObject(corpo)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }

    if (corpo.ativa !== undefined && typeof corpo.ativa !== "boolean") {
      throw new ValidationError("O campo ativa deve ser verdadeiro ou falso.");
    }

    const unidade = await atualizarUnidade(id, {
      nome: corpo.nome !== undefined ? requiredText(corpo.nome, "nome", 100) : undefined,
      ativa: corpo.ativa as boolean | undefined,
    });

    return NextResponse.json({ ok: true, message: "Unidade atualizada.", data: unidade });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao atualizar unidade:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível atualizar a unidade." },
      { status: 500 }
    );
  }
}

export const PATCH = comMetricasApi("admin/empresas/unidades/[id]", handlePATCH);
