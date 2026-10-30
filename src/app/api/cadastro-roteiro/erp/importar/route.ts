import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { isObject } from "@/lib/auth/validation";
import { encaminharRoteiroErp } from "@/lib/cadastro-roteiro/erp-roteiro";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { registrarLog } from "@/lib/monitoramento/logs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Inclui/altera operações do roteiro no ERP (POST /api/v2/roteiro/importar)
 * em nome do usuário logado. ?validar=1 só simula (/importar/validar).
 * O corpo é o mesmo que a tela já montava; a resposta do ERP volta igual.
 */
async function handlePOST(request: Request) {
  const acesso = await verificarAcessoModuloApi("cadastro-roteiro");
  if (acesso.negado) return acesso.negado;

  const corpo: unknown = await request.json().catch(() => null);
  if (!isObject(corpo)) {
    return NextResponse.json({ success: false, message: "O corpo da requisição deve ser um objeto JSON." }, { status: 400 });
  }

  const validar = new URL(request.url).searchParams.get("validar") === "1";
  const { resposta, json } = await encaminharRoteiroErp({
    caminho: validar ? "importar/validar" : "importar",
    metodo: "POST",
    corpo,
    samAccountName: acesso.usuario.samAccountName,
  });

  if (!validar) {
    await registrarLog({
      nivel: json?.success ? "info" : "aviso",
      origem: "cadastro-roteiro/erp",
      mensagem: `${acesso.usuario.nomeExibicao} ${json?.success ? "gravou" : "tentou gravar"} o roteiro de ${String(corpo.cod_item ?? "?")} no ERP.`,
      metodo: "POST",
      caminho: new URL(request.url).pathname,
    }).catch(() => {});
  }

  return resposta;
}

export const POST = comMetricasApi("cadastro-roteiro/erp/importar", handlePOST);
