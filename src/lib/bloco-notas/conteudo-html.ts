import "server-only";

import sanitizeHtml from "sanitize-html";

import { htmlParaTexto } from "@/lib/chamados/mensagem-html";

/*
 * Conteúdo das páginas do Bloco de Notas (HTML do RichTextEditor com os
 * recursos avançados ligados). Lista fechada de tags/atributos: o que o
 * editor gera -- inclusive lista de tarefas, marca-texto, cor do texto e
 * alinhamento -- e nada além. Imagem só se apontar para o próprio módulo
 * (/api/bloco-notas/imagens/{id}); quem serve a imagem ainda confere que
 * ela é do usuário logado.
 */

export const LIMITE_HTML_PAGINA = 2_000_000;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const SRC_IMAGEM_NOTA = new RegExp(`^/api/bloco-notas/imagens/${UUID}$`, "i");
const ALINHAMENTO = /^(left|right|center|justify)$/;
/* Cor como o editor grava: #rgb/#rrggbb, rgb()/rgba() -- e "inherit" (o marca-texto usa). */
const COR = /^(#[0-9a-f]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\)|inherit)$/i;
const LARGURA_COLUNA = /^\d{1,4}px$/;

const TAGS_PERMITIDAS = [
  "p", "br", "strong", "b", "em", "i", "u", "s", "del",
  "h1", "h2", "h3", "ul", "ol", "li", "blockquote", "pre", "code", "hr",
  "a", "img", "mark", "span",
  "table", "colgroup", "col", "thead", "tbody", "tr", "th", "td",
  /* Lista de tarefas: <li data-type="taskItem"><label><input type="checkbox"><span></span></label><div>...</div></li> */
  "label", "input", "div",
];

export function limparConteudoPagina(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: TAGS_PERMITIDAS,
    allowedAttributes: {
      a: ["href", "target", "rel"],
      img: ["src", "alt"],
      p: ["style"],
      h1: ["style"],
      h2: ["style"],
      h3: ["style"],
      ol: ["start"],
      ul: ["data-type"],
      li: ["data-type", "data-checked"],
      input: ["type", "checked"],
      mark: ["data-color", "style"],
      span: ["style"],
      col: ["style"],
      td: ["colspan", "rowspan", "colwidth", "style"],
      th: ["colspan", "rowspan", "colwidth", "style"],
    },
    allowedStyles: {
      p: { "text-align": [ALINHAMENTO] },
      h1: { "text-align": [ALINHAMENTO] },
      h2: { "text-align": [ALINHAMENTO] },
      h3: { "text-align": [ALINHAMENTO] },
      mark: { "background-color": [COR], color: [COR] },
      span: { color: [COR] },
      col: { width: [LARGURA_COLUNA], "min-width": [LARGURA_COLUNA] },
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
        const saida: sanitizeHtml.Attributes = SRC_IMAGEM_NOTA.test(src) ? { src, alt: attribs.alt || "Imagem" } : {};
        return { tagName, attribs: saida };
      },
      ul: (tagName, attribs) => {
        const saida: sanitizeHtml.Attributes = attribs["data-type"] === "taskList" ? { "data-type": "taskList" } : {};
        return { tagName, attribs: saida };
      },
      li: (tagName, attribs) => {
        const saida: sanitizeHtml.Attributes =
          attribs["data-type"] === "taskItem"
            ? { "data-type": "taskItem", "data-checked": attribs["data-checked"] === "true" ? "true" : "false" }
            : {};
        return { tagName, attribs: saida };
      },
      /* Só a caixinha da tarefa: qualquer outro input vira nada. */
      input: (tagName, attribs) => {
        const saida: sanitizeHtml.Attributes =
          attribs.type === "checkbox"
            ? { type: "checkbox", ...(attribs.checked !== undefined ? { checked: "checked" } : {}) }
            : {};
        return { tagName, attribs: saida };
      },
    },
    exclusiveFilter: (frame) =>
      (frame.tag === "img" && !frame.attribs.src) || (frame.tag === "input" && frame.attribs.type !== "checkbox"),
  });
}

/* Texto puro para a busca (mesma conversão das mensagens de chamado: tabela vira linhas). */
export function textoBuscaDoConteudo(htmlLimpo: string): string {
  return htmlParaTexto(htmlLimpo);
}
