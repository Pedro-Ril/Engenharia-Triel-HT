import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { contarRegrasPorUsuario } from "@/lib/aprovacoes/escopo-colaboradores";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Contagem por usuário, pra alimentar o badge na lista de seleção do painel de escopo -- independente de qual usuário está selecionado no momento. */
async function handleGET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const contagem = await contarRegrasPorUsuario();
    return NextResponse.json({ ok: true, data: contagem });
  } catch (error) {
    console.error("Erro ao contar regras de escopo por usuário:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível carregar as contagens." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/aprovacoes/escopo/contagem", handleGET);
