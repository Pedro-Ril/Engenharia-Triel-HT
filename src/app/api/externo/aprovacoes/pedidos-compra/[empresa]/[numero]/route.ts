import { NextResponse } from "next/server";

import { ValidationError } from "@/lib/auth/errors";
import {
  autenticarSistemaExterno,
  buscarSituacaoPedido,
  lerChavePedido,
} from "@/lib/aprovacoes/pedidos-compra";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ empresa: string; numero: string }>;
};

/*
 * Situação do pedido no portal (envio mais recente), para o
 * SupriConnect mostrar na lista dele: nao_enviado, pendente, aprovado
 * ou reprovado.
 */
async function handleGET(request: Request, context: RouteContext) {
  const negado = await autenticarSistemaExterno(request);
  if (negado) return negado;

  try {
    const { empresa, numero } = await context.params;
    const situacao = await buscarSituacaoPedido(lerChavePedido(empresa, numero));

    return NextResponse.json({ ok: true, data: situacao });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao consultar a situação do pedido de compra:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível consultar a situação do pedido." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("externo/aprovacoes/pedidos-compra/[empresa]/[numero]", handleGET);
