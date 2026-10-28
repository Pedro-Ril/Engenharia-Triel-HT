import "server-only";

import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";

import { formatarDataHoraCarimbo, planejarBlocos, textoParaWinAnsi } from "./pedido-compra-pdf-carimbo-layout";

/*
 * Carimbo das aprovações no PDF do pedido de compra: para cada nível que
 * aprovou, a rubrica da pessoa (se cadastrada), o nome, o nível e a data.
 *
 * Vai no rodapé, à direita do "Ass:" do comprador -- achado pelo texto
 * do PDF, porque o número de páginas muda de pedido para pedido. Sem o
 * "Ass:" (layout diferente) ou com mais níveis do que cabem ali, as
 * aprovações vão numa página "Aprovações" no fim: nunca se perdem.
 *
 * Só no PDF que o Portal entrega: o arquivo da pasta do Suprimentos não muda.
 */

export interface AprovacaoCarimbo {
  nivelOrdem: number;
  nivelNome: string;
  nome: string;
  /* ISO sem fuso (horário do servidor). */
  decididoEm: string;
  rubrica: Uint8Array | null;
}

interface LinhaAssinatura {
  paginaIndice: number;
  y: number;
}

const COR_TEXTO = rgb(0, 0, 0);
const COR_SUAVE = rgb(0.3, 0.3, 0.3);

/* Página e altura do "Ass:" -- o último do documento, se houver mais de um. */
async function localizarLinhaAssinatura(bytes: Uint8Array): Promise<LinhaAssinatura | null> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  /* O pdf.js fica com o buffer que recebe: vai uma cópia. */
  const documento = await pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: false, isEvalSupported: false, verbosity: 0 }).promise;

  try {
    let encontrada: LinhaAssinatura | null = null;

    for (let numero = 1; numero <= documento.numPages; numero += 1) {
      const pagina = await documento.getPage(numero);
      const conteudo = await pagina.getTextContent();

      for (const item of conteudo.items) {
        if ("str" in item && /^\s*Ass\s*:/.test(item.str)) {
          encontrada = { paginaIndice: numero - 1, y: item.transform[5] };
        }
      }
    }

    return encontrada;
  } finally {
    await documento.destroy();
  }
}

function desenharBloco(
  pagina: PDFPage,
  bloco: { x: number; yLinha: number; largura: number },
  aprovacao: AprovacaoCarimbo,
  imagem: PDFImage | null,
  fontes: { normal: PDFFont; negrito: PDFFont }
) {
  if (imagem) {
    const altura = 30;
    const largura = Math.min((imagem.width / imagem.height) * altura, bloco.largura);
    const alturaFinal = (largura / imagem.width) * imagem.height;
    pagina.drawImage(imagem, {
      x: bloco.x + (bloco.largura - largura) / 2,
      y: bloco.yLinha + 1,
      width: largura,
      height: alturaFinal,
    });
  }

  pagina.drawLine({
    start: { x: bloco.x, y: bloco.yLinha },
    end: { x: bloco.x + bloco.largura, y: bloco.yLinha },
    thickness: 0.6,
    color: COR_TEXTO,
  });

  const caber = (texto: string, fonte: PDFFont, tamanho: number) => {
    let resultado = textoParaWinAnsi(texto);
    while (resultado.length > 1 && fonte.widthOfTextAtSize(resultado, tamanho) > bloco.largura) {
      resultado = `${resultado.slice(0, -2)}…`;
    }
    return resultado;
  };

  pagina.drawText(caber(aprovacao.nome, fontes.negrito, 7), {
    x: bloco.x,
    y: bloco.yLinha - 9,
    size: 7,
    font: fontes.negrito,
    color: COR_TEXTO,
  });
  pagina.drawText(
    caber(`Nível ${aprovacao.nivelOrdem} · ${aprovacao.nivelNome} · ${formatarDataHoraCarimbo(aprovacao.decididoEm)}`, fontes.normal, 6),
    { x: bloco.x, y: bloco.yLinha - 17, size: 6, font: fontes.normal, color: COR_SUAVE }
  );
}

export async function carimbarAprovacoes(
  bytes: Uint8Array,
  aprovacoes: AprovacaoCarimbo[],
  rodape: string
): Promise<Uint8Array> {
  if (aprovacoes.length === 0) return bytes;

  const [linha, pdf] = await Promise.all([localizarLinhaAssinatura(bytes), PDFDocument.load(bytes)]);
  const fontes = {
    normal: await pdf.embedFont(StandardFonts.Helvetica),
    negrito: await pdf.embedFont(StandardFonts.HelveticaBold),
  };
  const imagens = await Promise.all(
    aprovacoes.map((aprovacao) => (aprovacao.rubrica ? pdf.embedPng(aprovacao.rubrica).catch(() => null) : null))
  );

  const ordenadas = aprovacoes
    .map((aprovacao, i) => ({ aprovacao, imagem: imagens[i] }))
    .sort((a, b) => a.aprovacao.nivelOrdem - b.aprovacao.nivelOrdem);

  const primeira = pdf.getPage(0);
  const { width: larguraPagina, height: alturaPagina } = primeira.getSize();

  /* No rodapé: à direita do "Ass:", da metade da página até a margem. */
  const noRodape = linha ? planejarBlocos(ordenadas.length, { xInicio: larguraPagina / 2, xFim: larguraPagina - 10 }) : null;

  if (linha && noRodape) {
    const pagina = pdf.getPage(linha.paginaIndice);
    const yLinha = linha.y - 2;
    noRodape.forEach((bloco, i) =>
      desenharBloco(pagina, { ...bloco, yLinha }, ordenadas[i].aprovacao, ordenadas[i].imagem, fontes)
    );
    pagina.drawText(textoParaWinAnsi(rodape), {
      x: noRodape[0].x,
      y: yLinha - 27,
      size: 6,
      font: fontes.normal,
      color: COR_SUAVE,
    });
    return pdf.save();
  }

  /* Página própria: três por linha, de cima para baixo. */
  const pagina = pdf.addPage([larguraPagina, alturaPagina]);
  pagina.drawText(textoParaWinAnsi("Aprovações"), { x: 40, y: alturaPagina - 60, size: 14, font: fontes.negrito });
  pagina.drawText(textoParaWinAnsi(rodape), { x: 40, y: alturaPagina - 76, size: 8, font: fontes.normal, color: COR_SUAVE });

  const porLinha = 3;
  for (let inicio = 0; inicio < ordenadas.length; inicio += porLinha) {
    const grupo = ordenadas.slice(inicio, inicio + porLinha);
    const blocos = planejarBlocos(porLinha, { xInicio: 40, xFim: larguraPagina - 40 })!;
    const yLinha = alturaPagina - 140 - (inicio / porLinha) * 80;
    grupo.forEach((item, i) => desenharBloco(pagina, { ...blocos[i], yLinha }, item.aprovacao, item.imagem, fontes));
  }

  return pdf.save();
}
