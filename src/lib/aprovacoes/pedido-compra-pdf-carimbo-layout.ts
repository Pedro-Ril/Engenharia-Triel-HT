/*
 * Contas do carimbo das aprovações no PDF -- puras, testadas em
 * pedido-compra-pdf-carimbo-layout.test.ts.
 */

/* Até três blocos lado a lado no rodapé; mais que isso não cabe (null = página própria). */
export const MAXIMO_BLOCOS_NO_RODAPE = 3;

const ESPACO_ENTRE_BLOCOS = 10;
const LARGURA_MAXIMA_BLOCO = 140;

export function planejarBlocos(
  quantidade: number,
  faixa: { xInicio: number; xFim: number }
): { x: number; largura: number }[] | null {
  if (quantidade < 1 || quantidade > MAXIMO_BLOCOS_NO_RODAPE) return null;

  const disponivel = faixa.xFim - faixa.xInicio - ESPACO_ENTRE_BLOCOS * (quantidade - 1);
  const largura = Math.min(LARGURA_MAXIMA_BLOCO, disponivel / quantidade);

  return Array.from({ length: quantidade }, (_, i) => ({
    x: faixa.xInicio + i * (largura + ESPACO_ENTRE_BLOCOS),
    largura,
  }));
}

/* "2026-10-27T14:32:10.123" -> "27/10/2026 14:32", sem passar por Date (sem susto de fuso). */
export function formatarDataHoraCarimbo(iso: string): string {
  const [data, hora = ""] = iso.split("T");
  const [ano, mes, dia] = data.split("-");
  return dia && mes && ano ? `${dia}/${mes}/${ano}${hora ? ` ${hora.slice(0, 5)}` : ""}` : iso;
}

/*
 * As fontes padrão do PDF (Helvetica) só escrevem o conjunto WinAnsi:
 * acentos do português passam; o resto (emoji, outros alfabetos) vira "?"
 * em vez de derrubar a geração do PDF.
 */
const EXTRAS_WINANSI = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");

export function textoParaWinAnsi(texto: string): string {
  return [...texto]
    .map((caractere) => {
      const codigo = caractere.codePointAt(0)!;
      return (codigo >= 0x20 && codigo <= 0x7e) || (codigo >= 0xa0 && codigo <= 0xff) || EXTRAS_WINANSI.has(caractere)
        ? caractere
        : "?";
    })
    .join("");
}
