import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { isObject } from "@/lib/auth/validation";
import { encaminharRoteiroErp } from "@/lib/cadastro-roteiro/erp-roteiro";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { registrarLog } from "@/lib/monitoramento/logs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Exclui UMA operação do roteiro no ERP (DELETE /api/v2/roteiro/operacao), em nome do usuário logado. */
async function handleDELETE(request: Request) {
  const acesso = await verificarAcessoModuloApi("cadastro-roteiro");
  if (acesso.negado) return acesso.negado;

  const corpo: unknown = await request.json().catch(() => null);
  if (!isObject(corpo)) {
    return NextResponse.json({ success: false, message: "O corpo da requisição deve ser um objeto JSON." }, { status: 400 });
  }

  const { resposta, json } = await encaminharRoteiroErp({
    caminho: "operacao",
    metodo: "DELETE",
    corpo,
    samAccountName: acesso.usuario.samAccountName,
  });

  await registrarLog({
    nivel: json?.success ? "info" : "aviso",
    origem: "cadastro-roteiro/erp",
    mensagem: `${acesso.usuario.nomeExibicao} ${json?.success ? "excluiu" : "tentou excluir"} a operação ${String(corpo.seq ?? "?")} (alternativo ${String(corpo.alternativo ?? "?")}) do roteiro de ${String(corpo.cod_item ?? "?")} no ERP.`,
    metodo: "DELETE",
    caminho: new URL(request.url).pathname,
  }).catch(() => {});

  return resposta;
}

export const DELETE = comMetricasApi("cadastro-roteiro/erp/operacao", handleDELETE);
