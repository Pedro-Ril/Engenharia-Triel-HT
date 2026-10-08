import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalInteger } from "@/lib/auth/validation";
import { limparChamadasExternasAntigas } from "@/lib/monitoramento/chamadas-externas";
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

    /*
     * As duas fontes que o portal escreve a cada evento envelhecem
     * pelo mesmo corte. As demais tabelas da tela (auditoria dos
     * módulos, notificações) são histórico de negócio e não entram
     * numa limpeza genérica de monitoramento.
     */
    const [removidosLogs, removidasChamadas] = await Promise.all([
      limparLogsAntigos(dias),
      limparChamadasExternasAntigas(dias),
    ]);

    const removidos = removidosLogs + removidasChamadas;

    return NextResponse.json({
      ok: true,
      message:
        `${removidos} registro(s) removido(s): ` +
        `${removidosLogs} de erros e eventos, ` +
        `${removidasChamadas} de chamadas externas.`,
      data: { removidos, removidosLogs, removidasChamadas },
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
