import "server-only";

import { randomUUID } from "node:crypto";

import sanitizeHtml from "sanitize-html";

import { ValidationError } from "@/lib/auth/errors";
import { requiredText } from "@/lib/auth/validation";

import { TAMANHO_MAXIMO_ANEXO_BYTES, type FormatoMensagem, type NovoAnexo } from "./chamados";

/*
 * Mensagens de chamado com texto formatado (descrição ao abrir e
 * respostas), escritas no RichTextEditor: prints colados no meio do
 * texto e tabelas coladas do Excel.
 *
 * Qualquer pessoa abre chamado, mesmo sem login, então o HTML que
 * chega do navegador nunca é confiável: passa por `limparHtmlMensagem`
 * (lista fechada de tags/atributos) antes de gravar, e de novo ao ler
 * (defesa extra caso alguma linha seja gravada por fora da rota).
 *
 * Prints colados: o navegador manda cada imagem como arquivo no campo
 * "imagensColadas" e, no HTML, `<img src="imagem-colada:N">` (N = posição
 * do arquivo). Aqui cada imagem ganha o id do anexo que vai ser gravado
 * (portal_chamados_anexos, mesma permissão dos anexos de sempre) e o
 * `src` passa a apontar para /api/chamados/anexos/{id}.
 */

export const LIMITE_TEXTO_MENSAGEM = 4000;
/* Teto do HTML bruto (tags inclusas), só para barrar abuso -- o limite que a pessoa vê é o do texto visível. */
const LIMITE_HTML_MENSAGEM = 200_000;
export const MAXIMO_IMAGENS_COLADAS = 10;
export const CAMPO_IMAGENS_COLADAS = "imagensColadas";

const SRC_IMAGEM_COLADA = /^imagem-colada:(\d{1,3})$/;
const ALINHAMENTO = /^(left|right|center|justify)$/;
const SRC_ANEXO = /^\/api\/chamados\/anexos\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EXTENSAO_POR_TIPO: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

const TAGS_PERMITIDAS = [
  "p", "br", "strong", "b", "em", "i", "u", "s", "del",
  "h2", "h3", "ul", "ol", "li", "blockquote", "pre", "code", "hr",
  "a", "img",
  "table", "thead", "tbody", "tr", "th", "td",
];

/*
 * `resolverImagem` (gravação): só aceita os marcadores "imagem-colada:N"
 * que ele mesmo souber resolver. Sem ele (leitura): aceita só imagens
 * que já apontam para um anexo de chamado. Qualquer outra imagem
 * (URL externa, data:, etc.) some.
 */
export function limparHtmlMensagem(html: string, resolverImagem?: (src: string) => string | null): string {
  return sanitizeHtml(html, {
    allowedTags: TAGS_PERMITIDAS,
    allowedAttributes: {
      a: ["href", "target", "rel"],
      img: ["src", "alt"],
      td: ["colspan", "rowspan", "style"],
      th: ["colspan", "rowspan", "style"],
      ol: ["start"],
    },
    /* Das propriedades CSS, só o alinhamento da célula (número à direita, como no Excel). */
    allowedStyles: {
      td: { "text-align": [ALINHAMENTO] },
      th: { "text-align": [ALINHAMENTO] },
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: { href: attribs.href ?? "", target: "_blank", rel: "noopener noreferrer" },
      }),
      img: (tagName, attribs) => {
        const src = attribs.src ?? "";
        const final = resolverImagem ? resolverImagem(src) : SRC_ANEXO.test(src) ? src : null;
        const saida: sanitizeHtml.Attributes = final ? { src: final, alt: "Imagem colada" } : {};
        return { tagName, attribs: saida };
      },
      td: (tagName, attribs) => ({ tagName, attribs: atributosDeCelula(attribs) }),
      th: (tagName, attribs) => ({ tagName, attribs: atributosDeCelula(attribs) }),
    },
    exclusiveFilter: (frame) => frame.tag === "img" && !frame.attribs.src,
  });
}

/* colspan/rowspan só como número pequeno ("1" é o padrão e nem precisa ir); do style, só text-align. */
function atributosDeCelula(attribs: sanitizeHtml.Attributes): sanitizeHtml.Attributes {
  const saida: sanitizeHtml.Attributes = {};
  for (const nome of ["colspan", "rowspan"]) {
    const valor = Number(attribs[nome]);
    if (Number.isInteger(valor) && valor > 1 && valor <= 100) saida[nome] = String(valor);
  }
  const alinhamento = /(?:^|;)\s*text-align\s*:\s*([a-z]+)\s*(?:;|$)/i.exec(attribs.style ?? "")?.[1]?.toLowerCase();
  if (alinhamento && ALINHAMENTO.test(alinhamento)) saida.style = `text-align: ${alinhamento}`;
  return saida;
}

function decodificarEntidades(texto: string): string {
  return texto
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, codigo: string) => String.fromCodePoint(Number(codigo)))
    .replace(/&#x([0-9a-f]+);/gi, (_, codigo: string) => String.fromCodePoint(parseInt(codigo, 16)))
    .replace(/&amp;/g, "&");
}

/*
 * Texto visível de um HTML já limpo -- conta o limite de caracteres,
 * vai na versão texto do e-mail. Tabela vira uma linha por linha da
 * tabela, células separadas por tabulação (cola de volta no Excel).
 */
export function htmlParaTexto(html: string): string {
  const texto = html
    .replace(/<img\b[^>]*>/gi, "")
    .replace(/<\/p>\s*(?=<\/t[dh]>)/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(td|th)>/gi, "\t")
    .replace(/<\/(p|h2|h3|li|tr|blockquote|pre|table|ul|ol)>/gi, "\n")
    .replace(/<[^>]*>/g, "");

  return decodificarEntidades(texto)
    .split("\n")
    .map((linha) => linha.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const ESTILO_TABELA_EMAIL =
  "border-collapse: collapse; margin: 6px 0 10px; font-style: normal;";
const ESTILO_CELULA_EMAIL =
  "border: 1px solid #d9dee6; padding: 4px 8px; text-align: left; vertical-align: top; font-size: 13px; font-style: normal;";

/*
 * HTML já limpo -> HTML para o corpo do e-mail (estilo inline, que é
 * o que o Outlook respeita). Imagens não vão: o leitor de e-mail não
 * tem a sessão do Portal para buscá-las -- ficam no cartão de anexos.
 */
export function htmlMensagemParaEmail(html: string): string {
  return html
    .replace(/<img\b[^>]*>/gi, '<span style="color: #6b7280;">[imagem: veja nos anexos]</span>')
    .replace(/(<t[dh]\b[^>]*>)\s*<p>/gi, "$1")
    .replace(/<\/p>\s*(<\/t[dh]>)/gi, "$1")
    .replace(/<table>/gi, `<table cellpadding="0" cellspacing="0" style="${ESTILO_TABELA_EMAIL}">`)
    .replace(/<(td|th)\b([^>]*)>/gi, (_, tag: string, atributos: string) => {
      /* O alinhamento da célula (único style que sobra da limpeza) vai depois, para ganhar do text-align: left. */
      const alinhamento = /\sstyle="([^"]*)"/i.exec(atributos)?.[1] ?? "";
      const resto = atributos.replace(/\sstyle="[^"]*"/i, "");
      const cabecalho = tag.toLowerCase() === "th" ? " background-color: #f3f4f6; font-weight: 700;" : "";
      return `<${tag}${resto} style="${ESTILO_CELULA_EMAIL}${cabecalho}${alinhamento ? ` ${alinhamento};` : ""}">`;
    })
    .replace(/<p>/gi, '<p style="margin: 0 0 8px;">');
}

export interface MensagemRecebida {
  texto: string;
  formato: FormatoMensagem;
  /* Prints colados, já com o id do anexo que o HTML referencia -- gravar junto com os anexos da mensagem. */
  imagens: NovoAnexo[];
}

/*
 * Lê a mensagem do formulário (multipart). Sem `formato=html` é o
 * texto puro de sempre (compatível com qualquer tela antiga em cache).
 */
export async function lerMensagemFormData(
  formData: FormData,
  campo: string,
  rotulo: string
): Promise<MensagemRecebida> {
  if (formData.get("formato") !== "html") {
    return {
      texto: requiredText(formData.get(campo), rotulo, LIMITE_TEXTO_MENSAGEM),
      formato: "texto",
      imagens: [],
    };
  }

  const bruto = formData.get(campo);

  if (typeof bruto !== "string" || !bruto.trim()) {
    throw new ValidationError(`Informe o campo ${rotulo}.`);
  }

  if (bruto.length > LIMITE_HTML_MENSAGEM) {
    throw new ValidationError(`O campo ${rotulo} ficou grande demais. Divida o conteúdo em mais de uma mensagem.`);
  }

  const arquivos = formData
    .getAll(CAMPO_IMAGENS_COLADAS)
    .filter((item): item is File => item instanceof File && item.size > 0);

  if (arquivos.length > MAXIMO_IMAGENS_COLADAS) {
    throw new ValidationError(`Cole no máximo ${MAXIMO_IMAGENS_COLADAS} imagens por mensagem.`);
  }

  const ids = arquivos.map(() => randomUUID());
  const usadas = new Set<number>();

  const texto = limparHtmlMensagem(bruto, (src) => {
    const marcador = SRC_IMAGEM_COLADA.exec(src);
    if (!marcador) return null;
    const indice = Number(marcador[1]);
    if (indice >= arquivos.length) return null;
    usadas.add(indice);
    return `/api/chamados/anexos/${ids[indice]}`;
  });

  const textoVisivel = htmlParaTexto(texto);

  if (!textoVisivel && usadas.size === 0) {
    throw new ValidationError(`Informe o campo ${rotulo}.`);
  }

  if (textoVisivel.length > LIMITE_TEXTO_MENSAGEM) {
    throw new ValidationError(
      `O campo ${rotulo} deve possuir no máximo ${LIMITE_TEXTO_MENSAGEM} caracteres.`
    );
  }

  const imagens: NovoAnexo[] = [];

  for (const indice of [...usadas].sort((a, b) => a - b)) {
    const arquivo = arquivos[indice];
    const extensao = EXTENSAO_POR_TIPO[arquivo.type];

    if (!extensao) {
      throw new ValidationError("Só dá para colar imagens PNG, JPG, GIF ou WEBP.");
    }

    if (arquivo.size > TAMANHO_MAXIMO_ANEXO_BYTES) {
      throw new ValidationError(
        `Uma das imagens coladas passa de ${TAMANHO_MAXIMO_ANEXO_BYTES / (1024 * 1024)} MB.`
      );
    }

    imagens.push({
      id: ids[indice],
      nomeArquivo: `imagem-colada-${imagens.length + 1}.${extensao}`,
      tipoMime: arquivo.type,
      tamanhoBytes: arquivo.size,
      conteudo: Buffer.from(await arquivo.arrayBuffer()),
    });
  }

  return { texto, formato: "html", imagens };
}
