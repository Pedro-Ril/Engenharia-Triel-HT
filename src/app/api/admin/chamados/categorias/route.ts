import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalInteger, requiredText } from "@/lib/auth/validation";
import { criarCategoria, listarCategoriasAdmin } from "@/lib/chamados/categorias";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uniqueIdentifierPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const categorias = await listarCategoriasAdmin();
    return NextResponse.json({ ok: true, data: categorias });
  } catch (error) {
    console.error("Erro ao listar categorias de chamados:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar as categorias." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const parsedBody: unknown = await request.json();
    if (!isObject(parsedBody)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }

    const setorId = requiredText(parsedBody.setorId, "setor", 60);

    if (!uniqueIdentifierPattern.test(setorId)) {
      throw new ValidationError("Informe um setor válido.");
    }

    const nome = requiredText(parsedBody.nome, "nome", 120);
    const ordem = optionalInteger(parsedBody.ordem, "ordem", 0);

    const categoria = await criarCategoria({ setorId, nome, ordem });

    return NextResponse.json(
      { ok: true, message: "Categoria criada.", data: categoria },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao criar categoria de chamado:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível criar a categoria." },
      { status: 500 }
    );
  }
}
