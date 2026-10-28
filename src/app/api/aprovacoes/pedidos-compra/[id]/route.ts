import { NextResponse } from "next/server";

import { requireAtendenteAprovacaoApi } from "@/lib/aprovacoes/autorizacao-aprovacoes";
import { consultarPedidoCompraErp, ErroConsultaErp } from "@/lib/aprovacoes/pedido-compra-erp";
import { buscarFluxoDoPedido, listarPedidosPainel } from "@/lib/aprovacoes/pedidos-compra";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const formatoId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/*
 * Detalhe de um pedido da fila: o que foi enviado (com a foto do envio)
 * e o pedido AO VIVO no ERP -- itens, pagamento, frete, impostos. O ERP
 * fora do ar não impede abrir o detalhe: volta `erroErp` e a tela
 * mostra só o que o portal tem.
 */
async function handleGET(_request: Request, context: RouteContext) {
  const acesso = await requireAtendenteAprovacaoApi("pedido_compra");
  if (acesso.negado) return acesso.negado;

  try {
    const { id } = await context.params;

    const [pedido] = formatoId.test(id)
      ? await listarPedidosPainel(acesso.usuario.id, { status: "todos", empresa: null, busca: "", id })
      : [];

    if (!pedido) {
      return NextResponse.json({ ok: false, message: "Pedido não encontrado." }, { status: 404 });
    }

    const fluxo = await buscarFluxoDoPedido(pedido.id, { empresa: pedido.empresa, numero: pedido.numero });

    let erp = null;
    let erroErp: string | null = null;

    try {
      erp = await consultarPedidoCompraErp(pedido.empresa, pedido.numero);
      if (!erp) erroErp = `O pedido ${pedido.numero} não foi encontrado no Focco.`;
    } catch (error) {
      if (!(error instanceof ErroConsultaErp)) throw error;
      erroErp = error.message;
    }

    return NextResponse.json({ ok: true, data: { pedido, erp, erroErp, fluxo } });
  } catch (error) {
    console.error("Erro ao abrir o pedido de compra:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível abrir o pedido de compra." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("aprovacoes/pedidos-compra/[id]", handleGET);
