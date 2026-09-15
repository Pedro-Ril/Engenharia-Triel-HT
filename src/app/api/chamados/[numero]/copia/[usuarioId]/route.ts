import { NextResponse } from "next/server";

import { carregarContextoAcao } from "@/lib/chamados/api-helpers";
import { removerUsuarioCopia } from "@/lib/chamados/chamados";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ numero: string; usuarioId: string }>;
}

async function handleDELETE(_request: Request, context: RouteContext) {
  const { numero, usuarioId } = await context.params;
  const { contexto, erro } = await carregarContextoAcao(numero, null);
  if (erro) return erro;

  const { chamado, usuario, ehAtendente, ehDono } = contexto;

  if (!usuario || (!ehAtendente && !ehDono)) {
    return NextResponse.json(
      { ok: false, message: "Você não pode remover pessoas em cópia neste chamado." },
      { status: 403 }
    );
  }

  try {
    await removerUsuarioCopia(chamado.id, usuarioId);
    return NextResponse.json({ ok: true, message: "Usuário removido da cópia." });
  } catch (error) {
    console.error("Erro ao remover usuário em cópia:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível remover o usuário em cópia." },
      { status: 500 }
    );
  }
}

export const DELETE = comMetricasApi("chamados/[numero]/copia/[usuarioId]", handleDELETE);
