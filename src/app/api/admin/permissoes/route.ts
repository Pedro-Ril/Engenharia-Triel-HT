import { NextResponse } from "next/server";

import { concederPermissao, listarPermissoes } from "@/lib/auth/admin";
import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject } from "@/lib/auth/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uniqueIdentifierPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const permissoes = await listarPermissoes();
    return NextResponse.json({ ok: true, data: permissoes });
  } catch (error) {
    console.error("Erro ao listar permissões:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar as permissões." },
      { status: 500 }
    );
  }
}

interface CreatePermissaoBody {
  usuarioId?: unknown;
  moduloId?: unknown;
}

export async function POST(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  let body: CreatePermissaoBody;

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
    if (
      typeof body.usuarioId !== "string" ||
      !uniqueIdentifierPattern.test(body.usuarioId)
    ) {
      throw new ValidationError("Informe um usuário válido.");
    }

    if (
      typeof body.moduloId !== "string" ||
      !uniqueIdentifierPattern.test(body.moduloId)
    ) {
      throw new ValidationError("Informe um módulo válido.");
    }

    const permissao = await concederPermissao({
      usuarioId: body.usuarioId,
      moduloId: body.moduloId,
      concedidoPor: acesso.usuario.samAccountName,
    });

    return NextResponse.json(
      { ok: true, message: "Acesso concedido.", data: permissao },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao conceder permissão:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível conceder o acesso." },
      { status: 500 }
    );
  }
}
