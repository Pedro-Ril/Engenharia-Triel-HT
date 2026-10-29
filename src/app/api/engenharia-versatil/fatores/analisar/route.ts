import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { analisarFatores } from "@/lib/engenharia-versatil/fator-conversao";
import { lerPlanilhaEnviada } from "@/lib/engenharia-versatil/planilha-enviada";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Conferência dos pesos e fatores de conversão (KG) contra o ERP: só lê. */
async function handlePOST(request: Request) {
  const acesso = await verificarAcessoModuloApi("engenharia-versatil");
  if (acesso.negado) return acesso.negado;

  try {
    const { conteudo, nome } = await lerPlanilhaEnviada(request);
    return NextResponse.json({ ok: true, data: await analisarFatores(conteudo, nome) });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    console.error("Erro ao conferir os fatores de conversão:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível consultar o ERP." }, { status: 500 });
  }
}

export const POST = comMetricasApi("engenharia-versatil/fatores/analisar", handlePOST);
