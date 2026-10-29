import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { analisarPlanilha } from "@/lib/engenharia-versatil/separacao";
import { lerPlanilhaEnviada } from "@/lib/engenharia-versatil/planilha-enviada";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Prévia da separação: só lê a planilha e as pastas, não cria nem copia nada. */
async function handlePOST(request: Request) {
  const acesso = await verificarAcessoModuloApi("engenharia-versatil");
  if (acesso.negado) return acesso.negado;

  try {
    const { conteudo, nome } = await lerPlanilhaEnviada(request);
    return NextResponse.json({ ok: true, data: await analisarPlanilha(conteudo, nome) });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    console.error("Erro ao analisar a planilha da Engenharia Versátil:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível analisar a planilha." }, { status: 500 });
  }
}

export const POST = comMetricasApi("engenharia-versatil/separacao/analisar", handlePOST);
