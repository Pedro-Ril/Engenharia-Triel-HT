import { NextResponse } from "next/server";

import { criarModulo, listarModulos } from "@/lib/auth/admin";
import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import {
  isObject,
  optionalBoolean,
  optionalInteger,
  optionalText,
  requiredChave,
  requiredText,
  requiredUuidArray,
} from "@/lib/auth/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const modulos = await listarModulos();
    return NextResponse.json({ ok: true, data: modulos });
  } catch (error) {
    console.error("Erro ao listar módulos:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar os módulos." },
      { status: 500 }
    );
  }
}

interface CreateModuloBody {
  setorIds?: unknown;
  chave?: unknown;
  nome?: unknown;
  path?: unknown;
  icone?: unknown;
  publicoSemLogin?: unknown;
  publicoAutenticado?: unknown;
  emDesenvolvimento?: unknown;
  ordem?: unknown;
}

export async function POST(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  let body: CreateModuloBody;

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
    const setorIds = requiredUuidArray(body.setorIds, "setores");
    const chave = requiredChave(body.chave, "chave");
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
    const ordem = optionalInteger(body.ordem, "ordem", 0);

    if (!path.startsWith("/")) {
      throw new ValidationError('O campo path deve começar com "/".');
    }

    const modulo = await criarModulo({
      setorIds,
      chave,
      nome,
      path,
      icone,
      publicoSemLogin,
      publicoAutenticado,
      emDesenvolvimento,
      ordem,
    });

    return NextResponse.json(
      { ok: true, message: "Módulo criado.", data: modulo },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao criar módulo:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível criar o módulo." },
      { status: 500 }
    );
  }
}
