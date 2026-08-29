import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { obterEstatisticasBanco } from "@/lib/monitoramento/banco";
import { contarLogsPorNivel } from "@/lib/monitoramento/logs";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { obterEstatisticasSistema } from "@/lib/monitoramento/sistema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const [banco, logsPorNivel] = await Promise.all([
      obterEstatisticasBanco(),
      contarLogsPorNivel(24),
    ]);

    return NextResponse.json({
      ok: true,
      data: {
        banco,
        sistema: obterEstatisticasSistema(),
        logsPorNivel,
      },
    });
  } catch (error) {
    console.error("Erro ao montar resumo de monitoramento:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível carregar os dados de monitoramento." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/monitoramento/resumo", handleGET);
