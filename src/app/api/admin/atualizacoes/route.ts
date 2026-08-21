import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject } from "@/lib/auth/validation";
import {
  criarAtualizacao,
  listarAtualizacoes,
} from "@/lib/atualizacoes/atualizacoes";
import { parseCorpoAtualizacao } from "@/lib/atualizacoes/validacao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const atualizacoes = await listarAtualizacoes();
    return NextResponse.json({ ok: true, data: atualizacoes });
  } catch (error) {
    console.error("Erro ao listar atualizações:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar as atualizações." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

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

    const atualizacao = await criarAtualizacao({
      ...params,
      criadoPor: acesso.usuario.samAccountName,
    });

    return NextResponse.json(
      { ok: true, message: "Atualização publicada.", data: atualizacao },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao criar atualização:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível criar a atualização." },
      { status: 500 }
    );
  }
}
