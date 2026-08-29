import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { obterResumoChamadasExternas } from "@/lib/monitoramento/chamadas-externas";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { obterResumoRequisicoes } from "@/lib/monitoramento/requisicoes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const [chamadasExternas, requisicoes] = await Promise.all([
      obterResumoChamadasExternas(),
      obterResumoRequisicoes(),
    ]);

    return NextResponse.json({
      ok: true,
      data: { chamadasExternas, requisicoes },
    });
  } catch (error) {
    console.error("Erro ao montar resumo de monitoramento de APIs:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível carregar os dados de monitoramento de APIs." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/monitoramento/apis", handleGET);
