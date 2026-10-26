import { NextResponse } from "next/server";

import { requireAtendenteAprovacaoApi } from "@/lib/aprovacoes/autorizacao-aprovacoes";
import { lerPdfPedidoCompra, localizarPdfPedidoCompra } from "@/lib/aprovacoes/pedido-compra-pdf";
import { buscarPedidoDoDiretor } from "@/lib/aprovacoes/pedidos-compra";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const formatoId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/*
 * PDF do pedido de compra, pelo id do item na fila -- não pelo número,
 * para só entregar o arquivo de quem o diretor pode ver.
 */
async function handleGET(_request: Request, context: RouteContext) {
  const acesso = await requireAtendenteAprovacaoApi("pedido_compra");
  if (acesso.negado) return acesso.negado;

  try {
    const { id } = await context.params;

    const pedido = formatoId.test(id) ? await buscarPedidoDoDiretor(id, acesso.usuario.id) : null;
    if (!pedido) {
      return NextResponse.json({ ok: false, message: "Pedido não encontrado." }, { status: 404 });
    }

    const caminho = await localizarPdfPedidoCompra(pedido.numero);
    if (!caminho) {
      return NextResponse.json(
        { ok: false, message: `O PDF do pedido ${pedido.numero} não está na pasta de pedidos de compra.` },
        { status: 404 }
      );
    }

    const conteudo = await lerPdfPedidoCompra(caminho);

    return new NextResponse(new Uint8Array(conteudo), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="pedido-${pedido.numero}.pdf"`,
        "Cache-Control": "no-store",
        "Content-Length": String(conteudo.length),
      },
    });
  } catch (error) {
    console.error("Erro ao abrir o PDF do pedido de compra:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível abrir o PDF do pedido." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("aprovacoes/pedidos-compra/[id]/pdf", handleGET);
