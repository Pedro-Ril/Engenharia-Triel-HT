import "server-only";

import { buscarConteudoAsset } from "@/lib/desenho-aprovacao/templates";
import type {
  ElementoCota,
  ElementoImagemSvg,
  ElementoRetangulo,
  ElementoTextoDinamico,
  TemplateElemento,
  TemplateJson,
} from "@/lib/desenho-aprovacao/template-schema";

import {
  calculateFittedArtworkBounds,
  createHorizontalDimensionLine,
  createText,
  createVerticalDimensionLine,
  escapeXml,
  parseTemplateSvgSource,
  renderTemplateArtwork,
} from "./generate-approval-drawing-svg";
import {
  resolverLayout,
  type BoundsResolvidos,
} from "./resolve-template-layout";

/*
 * Renderizador genérico: template_json + valores de campo -> SVG final.
 * Reaproveita as funções de desenho já existentes em
 * generate-approval-drawing-svg.ts (criadas originalmente só pro Silo
 * Graneleiro hardcoded) em vez de duplicá-las.
 */

function formatarValorTexto(valor: unknown, unidade?: string): string {
  if (valor === null || valor === undefined || valor === "") {
    return "";
  }

  if (typeof valor === "number") {
    const numeroFormatado = new Intl.NumberFormat("pt-BR", {
      maximumFractionDigits: 2,
    }).format(valor);

    return unidade ? `${numeroFormatado} ${unidade}` : numeroFormatado;
  }

  if (typeof valor === "boolean") {
    return valor ? "Sim" : "Não";
  }

  return String(valor);
}

function formatarMedida(valor: number, casasDecimais: number, prefixo?: string, sufixo?: string, unidade?: string): string {
  const numeroFormatado = valor.toFixed(casasDecimais);
  const comUnidade = unidade ? `${numeroFormatado} ${unidade}` : numeroFormatado;
  return `${prefixo ?? ""}${comUnidade}${sufixo ?? ""}`;
}

function renderizarRetangulo(
  elemento: ElementoRetangulo,
  bounds: BoundsResolvidos
): string {
  const preenchimento = elemento.preenchimento;
  const borda = elemento.borda;

  const fill = preenchimento ? escapeXml(preenchimento.cor) : "none";
  const fillOpacity = preenchimento?.opacidade ?? 1;
  const stroke = borda ? escapeXml(borda.cor) : "none";
  const strokeWidth = borda?.espessuraMm ?? 0;

  const strokeDasharray =
    borda?.estilo === "tracejado" ? "4 2" : borda?.estilo === "pontilhado" ? "1 1" : null;

  const centroX = (bounds.left + bounds.right) / 2;
  const centroY = (bounds.top + bounds.bottom) / 2;

  const transform = elemento.rotacaoGraus
    ? ` transform="rotate(${elemento.rotacaoGraus} ${centroX} ${centroY})"`
    : "";

  return `
    <rect
      x="${bounds.left}"
      y="${bounds.top}"
      width="${bounds.width}"
      height="${bounds.height}"
      rx="${elemento.raioBordaMm}"
      fill="${fill}"
      fill-opacity="${fillOpacity}"
      stroke="${stroke}"
      stroke-width="${strokeWidth}"
      ${strokeDasharray ? `stroke-dasharray="${strokeDasharray}"` : ""}
      opacity="${elemento.opacidade}"${transform}
    />
  `;
}

const ANCORA_HORIZONTAL: Record<ElementoTextoDinamico["estiloTexto"]["alinhamentoHorizontal"], "start" | "middle" | "end"> = {
  esquerda: "start",
  centro: "middle",
  direita: "end",
};

function renderizarTextoDinamico(
  elemento: ElementoTextoDinamico,
  valoresCampos: Record<string, unknown>,
  bounds: BoundsResolvidos
): string {
  const bruto = valoresCampos[elemento.campo];
  const valorBruto = bruto === undefined || bruto === null || bruto === "" ? elemento.valorPadrao : bruto;

  if ((valorBruto === undefined || valorBruto === "") && elemento.ocultarQuandoVazio) {
    return "";
  }

  const texto = `${elemento.prefixo ?? ""}${formatarValorTexto(valorBruto, elemento.unidade)}${elemento.sufixo ?? ""}`;

  return createText(bounds.left, bounds.top, texto, {
    fontSize: elemento.estiloTexto.tamanhoFonteMm,
    fontWeight: elemento.estiloTexto.pesoFonte === "bold" ? 700 : 400,
    textAnchor: ANCORA_HORIZONTAL[elemento.estiloTexto.alinhamentoHorizontal],
    fill: elemento.estiloTexto.cor,
    fontFamily: elemento.estiloTexto.familiaFonte,
    italic: elemento.estiloTexto.italico,
    underline: elemento.estiloTexto.sublinhado,
    letterSpacing: elemento.estiloTexto.espacamentoLetrasMm,
  });
}

function renderizarCota(
  elemento: ElementoCota,
  valoresCampos: Record<string, unknown>,
  resolvidos: Map<string, BoundsResolvidos>
): string {
  const bounds = resolvidos.get(elemento.id);

  if (!bounds) {
    throw new Error(`A cota "${elemento.id}" não foi resolvida pelo motor de layout.`);
  }

  let label: string;

  if (elemento.campoMedida) {
    const bruto = valoresCampos[elemento.campoMedida];
    const numero = typeof bruto === "number" ? bruto : Number(bruto);

    label = Number.isFinite(numero)
      ? formatarMedida(numero, elemento.casasDecimais, elemento.prefixo, elemento.sufixo, elemento.unidade)
      : `${elemento.prefixo ?? ""}${bruto ?? ""}${elemento.sufixo ?? ""}`;
  } else {
    const distancia = elemento.orientacao === "horizontal" ? bounds.width : bounds.height;
    label = formatarMedida(distancia, elemento.casasDecimais, elemento.prefixo, elemento.sufixo, elemento.unidade);
  }

  const referenciado =
    elemento.origem.modo === "limites_elemento" ? resolvidos.get(elemento.origem.elementoId) : undefined;

  if (elemento.orientacao === "horizontal") {
    const objectBottom = referenciado?.bottom ?? bounds.top;
    return createHorizontalDimensionLine(bounds.left, bounds.right, objectBottom, bounds.top, label);
  }

  const objectLeft = referenciado?.right ?? bounds.left;
  return createVerticalDimensionLine(objectLeft, bounds.top, bounds.bottom, bounds.left, label);
}

async function renderizarImagemSvg(
  elemento: ElementoImagemSvg,
  bounds: BoundsResolvidos
): Promise<string> {
  const asset = await buscarConteudoAsset(elemento.assetId);

  if (!asset) {
    throw new Error(`O asset "${elemento.assetId}" referenciado pelo elemento "${elemento.id}" não foi encontrado.`);
  }

  const parsed = parseTemplateSvgSource(asset.conteudo.toString("utf-8"), elemento.assetId);

  if (elemento.ajuste === "preencher") {
    return renderTemplateArtwork(parsed, bounds.left, bounds.top, bounds.width, bounds.height, "none");
  }

  const fitted = calculateFittedArtworkBounds(parsed, bounds.left, bounds.top, bounds.width, bounds.height);
  return renderTemplateArtwork(parsed, fitted.left, fitted.top, fitted.width, fitted.height);
}

async function renderizarElemento(
  elemento: TemplateElemento,
  valoresCampos: Record<string, unknown>,
  resolvidos: Map<string, BoundsResolvidos>
): Promise<string> {
  const bounds = resolvidos.get(elemento.id);

  if (!bounds) {
    throw new Error(`O elemento "${elemento.id}" não foi resolvido pelo motor de layout.`);
  }

  switch (elemento.tipo) {
    case "retangulo":
      return renderizarRetangulo(elemento, bounds);

    case "texto_dinamico":
      return renderizarTextoDinamico(elemento, valoresCampos, bounds);

    case "cota":
      return renderizarCota(elemento, valoresCampos, resolvidos);

    case "imagem_svg":
      return renderizarImagemSvg(elemento, bounds);
  }
}

export async function renderizarTemplate(
  templateJson: TemplateJson,
  valoresCampos: Record<string, unknown>
): Promise<string> {
  const resolvidos = resolverLayout(templateJson.elementos, valoresCampos);

  const elementosVisiveis = [...templateJson.elementos]
    .filter((elemento) => elemento.visivel)
    .sort((a, b) => a.ordem - b.ordem);

  const partes: string[] = [];

  for (const elemento of elementosVisiveis) {
    partes.push(await renderizarElemento(elemento, valoresCampos, resolvidos));
  }

  const { pagina } = templateJson;

  return `<?xml version="1.0" encoding="UTF-8"?>
    <svg
      xmlns="http://www.w3.org/2000/svg"
      xmlns:xlink="http://www.w3.org/1999/xlink"
      width="${pagina.larguraMm}mm"
      height="${pagina.alturaMm}mm"
      viewBox="0 0 ${pagina.larguraMm} ${pagina.alturaMm}"
      role="img"
    >
      <rect x="0" y="0" width="${pagina.larguraMm}" height="${pagina.alturaMm}" fill="${escapeXml(pagina.corFundo)}" />

      ${partes.join("\n")}
    </svg>
  `.trim();
}
