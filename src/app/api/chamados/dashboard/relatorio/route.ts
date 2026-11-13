import { NextResponse } from "next/server";

import { requireAtendenteChamadosApi } from "@/lib/chamados/autorizacao-chamados";
import {
  LIMITE_RELATORIO_CHAMADOS,
  filtrosDashboardDaUrl,
  listarChamadosRelatorio,
} from "@/lib/chamados/dashboard";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Lista de chamados do relatório exportado do dashboard (PDF/Excel) -- mesmos
 * filtros e mesmo escopo de setor do dashboard (admin vê tudo; atendente, só
 * os setores que atende).
 */
async function handleGET(request: Request) {
  const resultadoAcesso = await requireAtendenteChamadosApi();
  if (resultadoAcesso.negado) return resultadoAcesso.negado;

  const { setorIds } = resultadoAcesso.acesso;

  try {
    const relatorio = await listarChamadosRelatorio(
      filtrosDashboardDaUrl(new URL(request.url), setorIds)
    );

    return NextResponse.json({
      ok: true,
      data: { ...relatorio, limite: LIMITE_RELATORIO_CHAMADOS },
    });
  } catch (error) {
    console.error("Erro ao montar relatório de chamados:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível montar o relatório." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("chamados/dashboard/relatorio", handleGET);
