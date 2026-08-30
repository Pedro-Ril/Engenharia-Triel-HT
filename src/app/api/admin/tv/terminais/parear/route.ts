import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, requiredText } from "@/lib/auth/validation";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { parearTerminal } from "@/lib/tv/terminais";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ParearTerminalBody {
  codigo?: unknown;
  nome?: unknown;
}

async function handlePOST(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  let body: ParearTerminalBody;

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
    const codigo = requiredText(body.codigo, "código", 8);
    const nome = requiredText(body.nome, "nome", 150);

    const resultado = await parearTerminal({ codigo, nome });

    return NextResponse.json({
      ok: true,
      message: `Terminal "${nome}" pareado.`,
      data: resultado,
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao parear terminal de TV:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível parear o terminal." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("admin/tv/terminais/parear", handlePOST);
