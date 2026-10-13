import type { ModoAberturaArquivos } from "../constants/abertura-arquivos";

export type TipoArquivo = "pdf" | "3d";

/*
 * Nome fixo por tipo. É ele que faz "abrir outro fecha o atual": o
 * navegador procura uma janela já aberta com esse nome e a reaproveita,
 * trocando o conteúdo, em vez de empilhar janelas novas. De quebra, a
 * janela fica onde a pessoa deixou -- no segundo monitor, por exemplo.
 *
 * PDF e 3D têm janelas separadas: quem está roteirizando costuma querer
 * o desenho e o modelo lado a lado, e abrir o 3D não deveria derrubar o
 * desenho que estava aberto.
 */
const NOME_JANELA: Record<TipoArquivo, string> = {
  pdf: "portal-roteiro-pdf",
  "3d": "portal-roteiro-3d",
};

/*
 * O PDF chega como blob: criado nesta aba (ver itemPdf.service.ts), e
 * cada um ocupa memória até ser revogado. Em janela, o PDF novo
 * substitui o anterior no mesmo lugar, então o anterior pode ser
 * liberado. Em aba nova não: a aba antiga continua aberta mostrando-o.
 */
let pdfAtualNaJanela: string | null = null;

function recursosDaJanela(): string {
  const { availWidth, availHeight } = window.screen;
  const largura = Math.round(availWidth * 0.8);
  const altura = Math.round(availHeight * 0.85);

  /* Só vale na primeira abertura: depois o navegador mantém a janela
     onde a pessoa a colocou e ignora estes valores. */
  return [
    "popup=yes",
    `width=${largura}`,
    `height=${altura}`,
    `left=${Math.round((availWidth - largura) / 2)}`,
    `top=${Math.round((availHeight - altura) / 2)}`,
  ].join(",");
}

/*
 * Abre o arquivo do jeito que a pessoa escolheu em Minha conta.
 * Devolve false se o navegador bloqueou (pop-up bloqueado) -- quem chama
 * avisa, em vez de o clique simplesmente não fazer nada.
 */
export function abrirArquivo(
  url: string,
  tipo: TipoArquivo,
  modo: ModoAberturaArquivos
): boolean {
  if (modo === "aba") {
    return window.open(url, "_blank") !== null;
  }

  const janela = window.open(url, NOME_JANELA[tipo], recursosDaJanela());

  if (!janela) return false;

  /* Se a janela já existia e estava atrás de outra, traz para a frente. */
  janela.focus();

  if (tipo === "pdf") {
    const anterior = pdfAtualNaJanela;
    pdfAtualNaJanela = url;

    /* Folga para a janela terminar de trocar de documento. */
    if (anterior && anterior !== url) {
      window.setTimeout(() => URL.revokeObjectURL(anterior), 5000);
    }
  }

  return true;
}

export const MENSAGEM_POPUP_BLOQUEADO =
  "O navegador bloqueou a abertura. Libere os pop-ups para o portal (ícone na barra de endereço) e tente de novo.";
