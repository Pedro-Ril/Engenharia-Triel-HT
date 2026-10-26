import "server-only";

import fs from "fs/promises";
import path from "path";

/*
 * PDF do pedido de compra, gerado pelo Suprimentos: um arquivo por
 * pedido, com o número do pedido como nome ("104718.pdf"), para as
 * três empresas. Não precisa da empresa no nome: o número do pedido
 * (cod_pedc) é único no Focco entre todas elas. O Windows não diferencia
 * maiúsculas, então ".PDF" também é achado.
 *
 * A pasta tem dezenas de milhares de arquivos: abre direto pelo nome,
 * nunca lista -- mesma lição do PDF do roteiro (src/lib/pdf/roteiro-pdf.ts),
 * em que a listagem prendia as threads de disco e derrubava o portal.
 */
const PASTA_PEDIDOS =
  process.env.PDF_PEDIDOS_COMPRA_DIR ||
  String.raw`\\servidorgeral\Triel\Suprimentos\1-Pedidos de Compra (NÃO EXCLUIR)`;

/* Caminho do PDF do pedido, ou null quando não existe (ou a pasta não está acessível). */
export async function localizarPdfPedidoCompra(numero: number): Promise<string | null> {
  if (!Number.isSafeInteger(numero) || numero <= 0) return null;

  const caminho = path.join(PASTA_PEDIDOS, `${numero}.pdf`);

  try {
    return (await fs.stat(caminho)).isFile() ? caminho : null;
  } catch {
    return null;
  }
}

export async function lerPdfPedidoCompra(caminho: string): Promise<Buffer> {
  return fs.readFile(caminho);
}
