import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalInteger, requiredText } from "@/lib/auth/validation";
import { atualizarCategoria, excluirCategoria } from "@/lib/chamados/categorias";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uniqueIdentifierPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  if (!uniqueIdentifierPattern.test(id)) {
    return NextResponse.json(
      { ok: false, message: "O identificador da categoria é inválido." },
      { status: 400 }
    );
  }

  try {
    const parsedBody: unknown = await request.json();
    if (!isObject(parsedBody)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }

    if (parsedBody.ativo !== undefined && typeof parsedBody.ativo !== "boolean") {
      throw new ValidationError("O campo ativo deve ser verdadeiro ou falso.");
    }

    const categoria = await atualizarCategoria(id, {
      nome: parsedBody.nome !== undefined ? requiredText(parsedBody.nome, "nome", 120) : undefined,
      ordem:
        parsedBody.ordem !== undefined
          ? optionalInteger(parsedBody.ordem, "ordem", 0)
          : undefined,
      ativo: parsedBody.ativo as boolean | undefined,
    });

    return NextResponse.json({ ok: true, message: "Categoria atualizada.", data: categoria });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao atualizar categoria de chamado:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível atualizar a categoria." },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  if (!uniqueIdentifierPattern.test(id)) {
    return NextResponse.json(
      { ok: false, message: "O identificador da categoria é inválido." },
      { status: 400 }
    );
  }

  try {
    const removido = await excluirCategoria(id);

    if (!removido) {
      return NextResponse.json(
        { ok: false, message: "Categoria não encontrada." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, message: "Categoria excluída." });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao excluir categoria de chamado:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível excluir a categoria." },
      { status: 500 }
    );
  }
}
