import { NextResponse } from "next/server";

import { requireAtendenteAprovacaoApi } from "@/lib/aprovacoes/autorizacao-aprovacoes";
import { lerPdfPedidoCompra, localizarPdfPedidoCompra } from "@/lib/aprovacoes/pedido-compra-pdf";
import { carimbarAprovacoes } from "@/lib/aprovacoes/pedido-compra-pdf-carimbo";
import { buscarAprovacoesDoPedido, buscarPedidoDoDiretor } from "@/lib/aprovacoes/pedidos-compra";
import { buscarRubricasDe } from "@/lib/aprovacoes/rubricas";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const formatoId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/*
 * PDF do pedido de compra, pelo id do item na fila -- não pelo número,
 * para só entregar o arquivo de quem o diretor pode ver. Os níveis que
 * já aprovaram entram carimbados no rodapé (rubrica, nome, nível, data);
 * se o carimbo falhar, vai o PDF original -- nunca deixa de abrir.
 */
async function comAprovacoes(id: string, original: Buffer): Promise<Uint8Array> {
  try {
    const { numeroAprovacao, status, totalNiveis, aprovacoes } = await buscarAprovacoesDoPedido(id);
    if (aprovacoes.length === 0) return new Uint8Array(original);

    const rubricas = await buscarRubricasDe(aprovacoes.flatMap((a) => (a.usuarioId ? [a.usuarioId] : [])));

    return await carimbarAprovacoes(
      new Uint8Array(original),
      aprovacoes.map((a) => ({
        nivelOrdem: a.nivelOrdem,
        nivelNome: a.nivelNome,
        nome: a.nome,
        decididoEm: a.decididoEm,
        rubrica: a.usuarioId ? (rubricas.get(a.usuarioId.toUpperCase()) ?? null) : null,
      })),
      /* Só diz "aprovado" quando o último nível aprovou; antes disso, é andamento. */
      status === "aprovado"
        ? `Aprovado no Portal Triel-HT · aprovação #${numeroAprovacao}`
        : `Em aprovação no Portal Triel-HT · aprovação #${numeroAprovacao} · ${aprovacoes.length} de ${totalNiveis} nível(is)`
    );
  } catch (error) {
    console.error("Erro ao carimbar as aprovações no PDF do pedido (vai o original):", error);
    return new Uint8Array(original);
  }
}
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

    const conteudo = await comAprovacoes(id, await lerPdfPedidoCompra(caminho));

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
