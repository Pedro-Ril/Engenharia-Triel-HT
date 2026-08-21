import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject } from "@/lib/auth/validation";
import {
  atualizarAtualizacao,
  excluirAtualizacao,
} from "@/lib/atualizacoes/atualizacoes";
import { parseCorpoAtualizacao } from "@/lib/atualizacoes/validacao";

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
      { ok: false, message: "O identificador da atualização é inválido." },
      { status: 400 }
    );
  }

  let body: Record<string, unknown>;

  try {
    const parsedBody: unknown = await request.json();
    if (!isObject(parsedBody)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }
    body = parsedBody;
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { ok: false, message: "O corpo da requisição contém um JSON inválido." },
      { status: 400 }
    );
  }

  try {
    const params = parseCorpoAtualizacao(body);

    const atualizacao = await atualizarAtualizacao(id, params);

    if (!atualizacao) {
      return NextResponse.json(
        { ok: false, message: "Atualização não encontrada." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Atualização salva.",
      data: atualizacao,
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao atualizar atualização:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível salvar a atualização." },
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
      { ok: false, message: "O identificador da atualização é inválido." },
      { status: 400 }
    );
  }

  try {
    const removido = await excluirAtualizacao(id);

    if (!removido) {
      return NextResponse.json(
        { ok: false, message: "Atualização não encontrada." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, message: "Atualização excluída." });
  } catch (error) {
    console.error("Erro ao excluir atualização:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível excluir a atualização." },
      { status: 500 }
    );
  }
}
