import { NextResponse } from "next/server";

import { atualizarModulo, excluirModulo } from "@/lib/auth/admin";
import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import {
  isObject,
  optionalBoolean,
  optionalInteger,
  optionalText,
  requiredText,
  requiredUuidArray,
} from "@/lib/auth/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uniqueIdentifierPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface UpdateModuloBody {
  nome?: unknown;
  path?: unknown;
  icone?: unknown;
  publicoSemLogin?: unknown;
  publicoAutenticado?: unknown;
  emDesenvolvimento?: unknown;
  ativo?: unknown;
  ordem?: unknown;
  setorIds?: unknown;
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
      { ok: false, message: "O identificador do módulo é inválido." },
      { status: 400 }
    );
  }

  let body: UpdateModuloBody;

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
    const path = requiredText(body.path, "path", 200);
    const icone = optionalText(body.icone, "icone", 60);
    const publicoSemLogin = optionalBoolean(body.publicoSemLogin, "publicoSemLogin", false);
    const publicoAutenticado = optionalBoolean(
      body.publicoAutenticado,
      "publicoAutenticado",
      false
    );
    const emDesenvolvimento = optionalBoolean(
      body.emDesenvolvimento,
      "emDesenvolvimento",
      false
    );
    const ativo = optionalBoolean(body.ativo, "ativo", true);
    const ordem = optionalInteger(body.ordem, "ordem", 0);
    const setorIds = requiredUuidArray(body.setorIds, "setores");

    if (!path.startsWith("/")) {
      throw new ValidationError('O campo path deve começar com "/".');
    }

    const modulo = await atualizarModulo(id, {
      nome,
      path,
      icone,
      publicoSemLogin,
      publicoAutenticado,
      emDesenvolvimento,
      ativo,
      ordem,
      setorIds,
    });

    if (!modulo) {
      return NextResponse.json(
        { ok: false, message: "Módulo não encontrado." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, message: "Módulo atualizado.", data: modulo });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao atualizar módulo:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível atualizar o módulo." },
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
      { ok: false, message: "O identificador do módulo é inválido." },
      { status: 400 }
    );
  }

  try {
    const removido = await excluirModulo(id);

    if (!removido) {
      return NextResponse.json(
        { ok: false, message: "Módulo não encontrado." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, message: "Módulo excluído." });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 409 });
    }

    console.error("Erro ao excluir módulo:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível excluir o módulo." },
      { status: 500 }
    );
  }
}
