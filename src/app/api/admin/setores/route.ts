import { NextResponse } from "next/server";

import { criarSetor, listarSetores } from "@/lib/auth/admin";
import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import {
  isObject,
  optionalInteger,
  optionalText,
  requiredChave,
  requiredText,
} from "@/lib/auth/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const setores = await listarSetores();
    return NextResponse.json({ ok: true, data: setores });
  } catch (error) {
    console.error("Erro ao listar setores:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar os setores." },
      { status: 500 }
    );
  }
}

interface CreateSetorBody {
  chave?: unknown;
  nome?: unknown;
  icone?: unknown;
  ordem?: unknown;
}

export async function POST(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  let body: CreateSetorBody;

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
    const chave = requiredChave(body.chave, "chave");
    const nome = requiredText(body.nome, "nome", 150);
    const icone = optionalText(body.icone, "icone", 60);
    const ordem = optionalInteger(body.ordem, "ordem", 0);

    const setor = await criarSetor({ chave, nome, icone, ordem });

    return NextResponse.json(
      { ok: true, message: "Setor criado.", data: setor },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao criar setor:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível criar o setor." },
      { status: 500 }
    );
  }
}
