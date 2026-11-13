import { NextResponse } from "next/server";

import { requireAtendenteChamadosApi } from "@/lib/chamados/autorizacao-chamados";
import { buscarEstatisticasChamados, filtrosDashboardDaUrl } from "@/lib/chamados/dashboard";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET(request: Request) {
  const resultadoAcesso = await requireAtendenteChamadosApi();
  if (resultadoAcesso.negado) return resultadoAcesso.negado;

  const { setorIds } = resultadoAcesso.acesso;

  try {
    const estatisticas = await buscarEstatisticasChamados(
      filtrosDashboardDaUrl(new URL(request.url), setorIds)
    );

    return NextResponse.json({ ok: true, data: estatisticas });
  } catch (error) {
    console.error("Erro ao buscar estatísticas de chamados:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível carregar o dashboard." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("chamados/dashboard", handleGET);
