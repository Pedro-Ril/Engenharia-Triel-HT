import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { requiredUuidArray } from "@/lib/auth/validation";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { respostaDeErro } from "@/lib/rotas-avulsas/admin";
import { buscarImpressora, consultarSituacaoImpressora } from "@/lib/rotas-avulsas/impressao/impressao";
import { ErroIpp } from "@/lib/rotas-avulsas/impressao/ipp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/*
 * Testa a impressora sem imprimir nada: lê o estado dela
 * (Get-Printer-Attributes) e pergunta se aceitaria um PDF com a
 * configuração cadastrada (Validate-Job).
 */
async function handlePOST(_request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const { id } = await context.params;
    const impressora = await buscarImpressora(requiredUuidArray([id], "impressora")[0]);
    if (!impressora) return NextResponse.json({ ok: false, message: "Impressora não encontrada." }, { status: 404 });

    try {
      return NextResponse.json({ ok: true, data: await consultarSituacaoImpressora(impressora) });
    } catch (erro) {
      if (erro instanceof ErroIpp) return NextResponse.json({ ok: false, message: erro.message }, { status: 502 });
      throw erro;
    }
  } catch (erro) {
    return respostaDeErro(erro, "testar impressora", "Não foi possível testar a impressora.");
  }
}

export const POST = comMetricasApi("admin/impressao/impressoras/[id]/testar", handlePOST);
