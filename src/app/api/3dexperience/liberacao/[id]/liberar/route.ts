import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { requiredUuidArray } from "@/lib/auth/validation";
import { iniciarLiberacao } from "@/lib/3dexperience/liberacao-desenhos";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { registrarLog } from "@/lib/monitoramento/logs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/*
 * LIBERA de verdade no 3DX (produção) os desenhos que a simulação {id}
 * apontou. Sem desfazer simples: a tela confirma antes de chamar.
 */
async function handlePOST(request: Request, context: RouteContext) {
  const acesso = await verificarAcessoModuloApi("3dexperience");
  if (acesso.negado) return acesso.negado;

  try {
    const { id } = await context.params;
    const simulacaoId = requiredUuidArray([id], "simulação")[0];
    const liberacaoId = await iniciarLiberacao(simulacaoId, acesso.usuario);

    await registrarLog({
      nivel: "info",
      origem: "3dexperience/liberacao",
      mensagem: `${acesso.usuario.nomeExibicao} iniciou a liberação real de desenhos (simulação ${simulacaoId}).`,
      metodo: "POST",
      caminho: new URL(request.url).pathname,
    });

    return NextResponse.json({ ok: true, data: { id: liberacaoId } }, { status: 202 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    console.error("Erro ao iniciar a liberação de desenhos:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível iniciar a liberação." }, { status: 500 });
  }
}

export const POST = comMetricasApi("3dexperience/liberacao/[id]/liberar", handlePOST);
