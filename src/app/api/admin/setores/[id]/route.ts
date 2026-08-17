import { NextResponse } from "next/server";

import { atualizarSetor, excluirSetor } from "@/lib/auth/admin";
import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import {
  isObject,
  optionalBoolean,
  optionalInteger,
  optionalText,
  requiredText,
} from "@/lib/auth/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uniqueIdentifierPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface UpdateSetorBody {
  nome?: unknown;
  icone?: unknown;
  ordem?: unknown;
  ativo?: unknown;
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  if (!uniqueIdentifierPattern.test(id)) {
    return NextResponse.json(
      { ok: false, message: "O identificador do setor é inválido." },
      { status: 400 }
    );
  }

  let body: UpdateSetorBody;

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
    const nome = requiredText(body.nome, "nome", 150);
    const icone = optionalText(body.icone, "icone", 60);
    const ordem = optionalInteger(body.ordem, "ordem", 0);
    const ativo = optionalBoolean(body.ativo, "ativo", true);

    const setor = await atualizarSetor(id, { nome, icone, ordem, ativo });

    if (!setor) {
      return NextResponse.json(
        { ok: false, message: "Setor não encontrado." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, message: "Setor atualizado.", data: setor });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao atualizar setor:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível atualizar o setor." },
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
      { ok: false, message: "O identificador do setor é inválido." },
      { status: 400 }
    );
  }

  try {
    const removido = await excluirSetor(id);

    if (!removido) {
      return NextResponse.json(
        { ok: false, message: "Setor não encontrado." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, message: "Setor excluído." });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 409 });
    }

    console.error("Erro ao excluir setor:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível excluir o setor." },
      { status: 500 }
    );
  }
}
