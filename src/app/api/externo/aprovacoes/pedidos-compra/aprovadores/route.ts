import { NextResponse } from "next/server";

import { ValidationError } from "@/lib/auth/errors";
import {
  autenticarSistemaExterno,
  lerChavePedido,
  listarAprovadoresPedidoCompra,
} from "@/lib/aprovacoes/pedidos-compra";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Diretores que podem receber pedido de compra, com as empresas que
 * cada um aprova (Administração → Diretoria → Pedidos de Compra), para
 * o SupriConnect montar a escolha do comprador. `?empresa=2` traz só
 * quem aprova aquela empresa. O `login` é o que volta no campo
 * `aprovador` do envio.
 */
async function handleGET(request: Request) {
  const negado = await autenticarSistemaExterno(request);
  if (negado) return negado;

  try {
    const empresaParam = new URL(request.url).searchParams.get("empresa");
    /* Reaproveita a validação da chave do pedido só para a empresa. */
    const empresa = empresaParam ? lerChavePedido(empresaParam, 1).empresa : null;
    const aprovadores = await listarAprovadoresPedidoCompra(empresa);
    return NextResponse.json({ ok: true, data: aprovadores });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao listar os aprovadores de pedidos de compra:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar os aprovadores." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("externo/aprovacoes/pedidos-compra/aprovadores", handleGET);
