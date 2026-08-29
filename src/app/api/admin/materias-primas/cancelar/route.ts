import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, requiredText } from "@/lib/auth/validation";
import { cancelarSincronizacao } from "@/lib/materias-primas/materias-primas";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CancelarBody {
  codEmpresa?: unknown;
}

async function handlePOST(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  let body: CancelarBody;

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
    const codEmpresa = requiredText(body.codEmpresa, "código da empresa", 30);

    const havia = await cancelarSincronizacao(codEmpresa);
    return NextResponse.json({
      ok: true,
      message: havia
        ? "Cancelamento solicitado — a sincronização vai parar em instantes."
        : "Não havia sincronização em andamento para cancelar.",
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao cancelar sincronização de matéria-prima:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível cancelar a sincronização." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("admin/materias-primas/cancelar", handlePOST);
