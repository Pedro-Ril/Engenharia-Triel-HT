import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalInteger } from "@/lib/auth/validation";
import { limparLogsAntigos } from "@/lib/monitoramento/logs";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handlePOST(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const parsedBody: unknown = await request.json().catch(() => ({}));
    const body = isObject(parsedBody) ? parsedBody : {};

    const dias = optionalInteger(body.dias, "dias", 30);

    if (dias < 1) {
      throw new ValidationError("Informe pelo menos 1 dia para manter.");
    }

    const removidos = await limparLogsAntigos(dias);

    return NextResponse.json({
      ok: true,
      message: `${removidos} registro(s) removido(s).`,
      data: { removidos },
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao limpar logs antigos:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível limpar os logs." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("admin/monitoramento/logs/limpar", handlePOST);
