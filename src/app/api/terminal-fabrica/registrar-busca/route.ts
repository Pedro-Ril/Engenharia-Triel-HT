import { NextResponse } from "next/server";

import { getUsuarioAutenticado } from "@/lib/auth/autorizacao";
import { isObject, optionalBoolean, requiredText } from "@/lib/auth/validation";
import { ValidationError } from "@/lib/auth/errors";
import { extrairIpOrigem } from "@/lib/auth/login-historico";
import { registrarBuscaTerminalFabrica } from "@/lib/auth/terminal-fabrica-buscas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RegistrarBuscaBody {
  codigo?: unknown;
  encontrado?: unknown;
}

/*
 * Rota pública (o terminal de fábrica não exige login) — só
 * confere se HÁ uma sessão válida no navegador, sem exigir
 * uma. Se houver, a busca fica nomeada com esse usuário; caso
 * contrário, fica anônima (uso comum num terminal
 * compartilhado de chão de fábrica).
 */
export async function POST(request: Request) {
  let body: RegistrarBuscaBody;

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
    const codigo = requiredText(body.codigo, "código", 60);
    const encontrado = optionalBoolean(body.encontrado, "encontrado", false);

    const usuario = await getUsuarioAutenticado();

    await registrarBuscaTerminalFabrica({
      usuarioId: usuario?.id ?? null,
      codigoBuscado: codigo,
      encontrado,
      ipOrigem: extrairIpOrigem(request),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao registrar busca do terminal de fábrica:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível registrar a busca." },
      { status: 500 }
    );
  }
}
