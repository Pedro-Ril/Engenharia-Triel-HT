import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { requiredUuidArray } from "@/lib/auth/validation";
import { descartarSenhaAgendada } from "@/lib/3dexperience/liberacao-agendada";
import { cancelarRodadaAgendada, donoDaRodada } from "@/lib/3dexperience/liberacao-desenhos";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { registrarLog } from "@/lib/monitoramento/logs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/* Cancela uma liberação agendada que ainda não começou. Só quem pediu (ou um administrador do Portal). */
async function handlePOST(request: Request, context: RouteContext) {
  const acesso = await verificarAcessoModuloApi("3dexperience");
  if (acesso.negado) return acesso.negado;

  try {
    const { id } = await context.params;
    const rodadaId = requiredUuidArray([id], "rodada")[0];
    const dono = await donoDaRodada(rodadaId);
    if (!dono) return NextResponse.json({ ok: false, message: "Rodada não encontrada." }, { status: 404 });
    if (!acesso.usuario.ehAdministrador && dono.usuarioId?.toLowerCase() !== acesso.usuario.id.toLowerCase()) {
      return NextResponse.json({ ok: false, message: "Só quem agendou pode cancelar." }, { status: 403 });
    }
    if (!(await cancelarRodadaAgendada(rodadaId))) {
      throw new ValidationError("A liberação já começou e não dá mais para cancelar.");
    }
    descartarSenhaAgendada(rodadaId);

    await registrarLog({
      nivel: "info",
      origem: "3dexperience/liberacao",
      mensagem: `${acesso.usuario.nomeExibicao} cancelou a liberação agendada ${rodadaId}.`,
      metodo: "POST",
      caminho: new URL(request.url).pathname,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    console.error("Erro ao cancelar a liberação agendada:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível cancelar." }, { status: 500 });
  }
}

export const POST = comMetricasApi("3dexperience/liberacao/[id]/cancelar", handlePOST);
