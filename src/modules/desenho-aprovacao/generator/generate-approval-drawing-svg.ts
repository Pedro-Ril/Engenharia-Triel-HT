import "server-only";

import {
  readFileSync,
} from "node:fs";
import path from "node:path";

export type ApprovalDrawingRepresentation =
  | "lateral"
  | "superior"
  | "completo";

export type ApprovalDrawingProductCategory =
  | "Silo Graneleiro"
  | "Aves"
  | "Suinos";

export interface ApprovalDrawingTemplateInfo {
  produto: ApprovalDrawingProductCategory;
  codigo: string;
  versao: number;
  geradorVersao: string;
  configurado: boolean;
}

export class UnsupportedApprovalDrawingProductError
  extends Error {
  constructor(product: string | null) {
    super(
      product
        ? `A categoria de produto "${product}" não possui um template de desenho reconhecido.`
        : "A categoria de produto não foi informada."
    );

    this.name =
      "UnsupportedApprovalDrawingProductError";
  }
}

export class ApprovalDrawingTemplateNotConfiguredError
  extends Error {
  readonly produto:
    ApprovalDrawingProductCategory;

  constructor(
    produto: ApprovalDrawingProductCategory
  ) {
    super(
      `O template de SVG para a categoria "${produto}" ainda não está configurado.`
    );

    this.name =
      "ApprovalDrawingTemplateNotConfiguredError";

    this.produto = produto;
  }
}

export interface ApprovalDrawingData {
  numero: string;
  codigoRevisao: string;

  cliente: string | null;
  produto: string | null;
  modelo: string | null;

  caminhao: string | null;
  cabine: string | null;

  comprimento: number | null;
  altura: number | null;

  capacidadeTon: number | null;
  volumeM3: number | null;

  compartimentos: number | null;
  peso: number | null;

  cargaDianteira: number | null;
  cargaTraseira: number | null;

  observacoes: string | null;

  tipoRepresentacao:
    ApprovalDrawingRepresentation;

  dataEmissao: string | null;
  previsaoAprovacao: string | null;
  criadoEm?: string | null;

  incluirCotas: boolean;
  incluirCaminhao: boolean;

  criadoPor: string;
}

interface SvgBounds {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

interface ParsedTemplateSvg {
  viewBox: string;
  bounds: SvgBounds;
  innerContent: string;
}

interface FittedArtworkBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

interface ProductTemplateDefinition
  extends ApprovalDrawingTemplateInfo {
  lateralPath?: string;
  superiorPath?: string;
}

const PAGE_WIDTH = 420;
const PAGE_HEIGHT = 297;

const DRAWING_LEFT = 3;
const DRAWING_TOP = 3;
const DRAWING_RIGHT = 417;
const DRAWING_BOTTOM = 270;

const FOOTER_TOP = 270;
const FOOTER_BOTTOM = 294;

const TEMPLATE_ROOT = path.join(
  process.cwd(),
  "public",
  "desenho-aprovacao",
  "templates"
);

const TRIEL_HT_LOGO_DATA_URI =
  "data:image/png;base64,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";

const templateCache =
  new Map<string, ParsedTemplateSvg>();

const productTemplates: Record<
  ApprovalDrawingProductCategory,
  ProductTemplateDefinition
> = {
  "Silo Graneleiro": {
    produto: "Silo Graneleiro",
    codigo:
      "silo-graneleiro-solidworks-a3-horizontal",
    versao: 6,
    geradorVersao: "2.1.0",
    configurado: true,
    lateralPath: path.join(
      TEMPLATE_ROOT,
      "silo-graneleiro",
      "silo-lateral.svg"
    ),
    superiorPath: path.join(
      TEMPLATE_ROOT,
      "silo-graneleiro",
      "silo-superior.svg"
    ),
  },

  Aves: {
    produto: "Aves",
    codigo: "aves-a3-horizontal",
    versao: 1,
    geradorVersao: "1.0.0",
    configurado: false,
  },

  Suinos: {
    produto: "Suinos",
    codigo: "suinos-a3-horizontal",
    versao: 1,
    geradorVersao: "1.0.0",
    configurado: false,
  },
};

function escapeXml(
  value: string | null | undefined
): string {
  if (!value) {
    return "";
  }

  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function normalizeProductName(
  value: string
): string {
  return value
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function getApprovalDrawingProductCategory(
  product: string | null
): ApprovalDrawingProductCategory {
  if (!product?.trim()) {
    throw new UnsupportedApprovalDrawingProductError(
      product
    );
  }

  switch (normalizeProductName(product)) {
    case "silo graneleiro":
      return "Silo Graneleiro";

    case "aves":
      return "Aves";

    case "suinos":
      return "Suinos";

    default:
      throw new UnsupportedApprovalDrawingProductError(
        product
      );
  }
}

export function getApprovalDrawingTemplateInfo(
  product: string | null
): ApprovalDrawingTemplateInfo {
  const category =
    getApprovalDrawingProductCategory(
      product
    );

  const template =
    productTemplates[category];

  return {
    produto: template.produto,
    codigo: template.codigo,
    versao: template.versao,
    geradorVersao:
      template.geradorVersao,
    configurado:
      template.configurado,
  };
}

function parseTemplateSvg(
  filePath: string
): ParsedTemplateSvg {
  const cached =
    templateCache.get(filePath);

  if (cached) {
    return cached;
  }

  const source = readFileSync(
    filePath,
    "utf8"
  ).trim();

  if (
    /<script\b|<foreignObject\b/i.test(
      source
    )
  ) {
    throw new Error(
      `O template SVG possui elementos não permitidos: ${filePath}`
    );
  }

  const svgTagMatch = source.match(
    /<svg\b([^>]*)>/i
  );

  if (!svgTagMatch) {
    throw new Error(
      `O template não contém uma tag SVG válida: ${filePath}`
    );
  }

  const viewBoxMatch =
    svgTagMatch[1].match(
      /viewBox\s*=\s*["']([^"']+)["']/i
    );

  if (!viewBoxMatch) {
    throw new Error(
      `O template não possui viewBox: ${filePath}`
    );
  }

  const viewBox =
    viewBoxMatch[1].trim();

  const viewBoxValues = viewBox
    .split(/[\s,]+/)
    .map(Number);

  if (
    viewBoxValues.length !== 4 ||
    viewBoxValues.some(
      (value) =>
        !Number.isFinite(value)
    ) ||
    viewBoxValues[2] <= 0 ||
    viewBoxValues[3] <= 0
  ) {
    throw new Error(
      `O template possui um viewBox inválido: ${filePath}`
    );
  }

  const [
    minX,
    minY,
    width,
    height,
  ] = viewBoxValues;

  const innerContent = source
    .replace(/^<\?xml[^>]*>\s*/i, "")
    .replace(/<!--([\s\S]*?)-->/g, "")
    .replace(/^[\s\S]*?<svg\b[^>]*>/i, "")
    .replace(/<\/svg>\s*$/i, "")
    .trim();

  const parsed = {
    viewBox,
    bounds: {
      minX,
      minY,
      width,
      height,
    },
    innerContent,
  };

  templateCache.set(
    filePath,
    parsed
  );

  return parsed;
}

function formatDate(
  value: string | null | undefined
): string {
  if (!value) {
    return "—";
  }

  const [year, month, day] = value
    .slice(0, 10)
    .split("-");

  if (!year || !month || !day) {
    return escapeXml(value);
  }

  return `${day}/${month}/${year}`;
}

function formatNumber(
  value: number | null,
  suffix: string
): string {
  if (value === null) {
    return "—";
  }

  return `${new Intl.NumberFormat(
    "pt-BR",
    {
      maximumFractionDigits: 2,
    }
  ).format(value)} ${suffix}`;
}

function createText(
  x: number,
  y: number,
  text: string,
  options?: {
    fontSize?: number;
    fontWeight?: number;
    textAnchor?:
      | "start"
      | "middle"
      | "end";
  }
): string {
  return `
    <text
      x="${x}"
      y="${y}"
      font-size="${options?.fontSize ?? 3.2}"
      font-weight="${options?.fontWeight ?? 400}"
      text-anchor="${options?.textAnchor ?? "start"}"
      font-family="Arial, Helvetica, sans-serif"
      fill="#111111"
    >
      ${escapeXml(text)}
    </text>
  `;
}

function createHorizontalDimensionLine(
  objectLeft: number,
  objectRight: number,
  objectBottom: number,
  dimensionY: number,
  label: string
): string {
  const centerX =
    (objectLeft + objectRight) / 2;

  const extensionStartY =
    objectBottom + 1;

  return `
    <g
      stroke="#1f4e79"
      fill="none"
      stroke-width="0.35"
    >
      <line
        x1="${objectLeft}"
        y1="${dimensionY}"
        x2="${objectRight}"
        y2="${dimensionY}"
      />

      <line
        x1="${objectLeft}"
        y1="${extensionStartY}"
        x2="${objectLeft}"
        y2="${dimensionY + 2}"
      />

      <line
        x1="${objectRight}"
        y1="${extensionStartY}"
        x2="${objectRight}"
        y2="${dimensionY + 2}"
      />

      <line
        x1="${objectLeft - 1.6}"
        y1="${dimensionY - 1.6}"
        x2="${objectLeft + 1.6}"
        y2="${dimensionY + 1.6}"
      />

      <line
        x1="${objectRight - 1.6}"
        y1="${dimensionY - 1.6}"
        x2="${objectRight + 1.6}"
        y2="${dimensionY + 1.6}"
      />
    </g>

    ${createText(
      centerX,
      dimensionY - 1.5,
      label,
      {
        fontSize: 3.8,
        fontWeight: 600,
        textAnchor: "middle",
      }
    )}
  `;
}

function createVerticalDimensionLine(
  objectLeft: number,
  objectTop: number,
  objectBottom: number,
  dimensionX: number,
  label: string
): string {
  const centerY =
    (objectTop + objectBottom) / 2;

  const extensionEndX =
    objectLeft - 1;

  return `
    <g
      stroke="#1f4e79"
      fill="none"
      stroke-width="0.35"
    >
      <line
        x1="${dimensionX}"
        y1="${objectTop}"
        x2="${dimensionX}"
        y2="${objectBottom}"
      />

      <line
        x1="${dimensionX - 2}"
        y1="${objectTop}"
        x2="${extensionEndX}"
        y2="${objectTop}"
      />

      <line
        x1="${dimensionX - 2}"
        y1="${objectBottom}"
        x2="${extensionEndX}"
        y2="${objectBottom}"
      />

      <line
        x1="${dimensionX - 1.6}"
        y1="${objectTop + 1.6}"
        x2="${dimensionX + 1.6}"
        y2="${objectTop - 1.6}"
      />

      <line
        x1="${dimensionX - 1.6}"
        y1="${objectBottom + 1.6}"
        x2="${dimensionX + 1.6}"
        y2="${objectBottom - 1.6}"
      />
    </g>

    <text
      x="${dimensionX - 2.5}"
      y="${centerY}"
      font-size="3.8"
      font-weight="600"
      text-anchor="middle"
      font-family="Arial, Helvetica, sans-serif"
      fill="#111111"
      transform="rotate(-90 ${dimensionX - 2.5} ${centerY})"
    >
      ${escapeXml(label)}
    </text>
  `;
}

function calculateFittedArtworkBounds(
  template: ParsedTemplateSvg,
  x: number,
  y: number,
  width: number,
  height: number
): FittedArtworkBounds {
  const scale = Math.min(
    width / template.bounds.width,
    height / template.bounds.height
  );

  const fittedWidth =
    template.bounds.width * scale;

  const fittedHeight =
    template.bounds.height * scale;

  const left =
    x + (width - fittedWidth) / 2;

  const top =
    y + (height - fittedHeight) / 2;

  return {
    left,
    top,
    right: left + fittedWidth,
    bottom: top + fittedHeight,
    width: fittedWidth,
    height: fittedHeight,
  };
}

function renderTemplateArtwork(
  template: ParsedTemplateSvg,
  x: number,
  y: number,
  width: number,
  height: number
): string {
  return `
    <svg
      x="${x}"
      y="${y}"
      width="${width}"
      height="${height}"
      viewBox="${template.viewBox}"
      preserveAspectRatio="xMidYMid meet"
      overflow="hidden"
    >
      ${template.innerContent}
    </svg>
  `;
}

function renderView(
  title: string,
  template: ParsedTemplateSvg,
  data: ApprovalDrawingData,
  x: number,
  y: number,
  width: number,
  height: number,
  showVerticalDimension: boolean
): string {
  const titleHeight = 8;

  const horizontalDimensionSpace =
    data.incluirCotas ? 10 : 2;

  const verticalDimensionSpace =
    data.incluirCotas &&
    showVerticalDimension
      ? 11
      : 4;

  const artworkX =
    x + verticalDimensionSpace;

  const artworkY =
    y + titleHeight;

  const artworkWidth =
    width -
    verticalDimensionSpace -
    4;

  const artworkHeight =
    height -
    titleHeight -
    horizontalDimensionSpace;

  const fittedBounds =
    calculateFittedArtworkBounds(
      template,
      artworkX,
      artworkY,
      artworkWidth,
      artworkHeight
    );

  const horizontalDimensionY =
    y + height - 3;

  const verticalDimensionX =
    x + 4;

  return `
    <g>
      ${createText(
        x + 1,
        y + 5,
        title,
        {
          fontSize: 5,
          fontWeight: 700,
        }
      )}

      ${renderTemplateArtwork(
        template,
        artworkX,
        artworkY,
        artworkWidth,
        artworkHeight
      )}

      ${
        data.incluirCotas
          ? createHorizontalDimensionLine(
              fittedBounds.left,
              fittedBounds.right,
              fittedBounds.bottom,
              horizontalDimensionY,
              formatNumber(
                data.comprimento,
                "mm"
              )
            )
          : ""
      }

      ${
        data.incluirCotas &&
        showVerticalDimension
          ? createVerticalDimensionLine(
              fittedBounds.left,
              fittedBounds.top,
              fittedBounds.bottom,
              verticalDimensionX,
              formatNumber(
                data.altura,
                "mm"
              )
            )
          : ""
      }
    </g>
  `;
}

function renderFooter(
  data: ApprovalDrawingData
): string {
  const creationDate =
    data.criadoEm ??
    data.dataEmissao;

  const footerHeight =
    FOOTER_BOTTOM -
    FOOTER_TOP;

  const logoRight = 70;
  const clientRight = 242;
  const dateRight = 318;
  const revisionRight = 368;

  return `
    <g id="drawing-footer">
      <rect
        x="${DRAWING_LEFT}"
        y="${FOOTER_TOP}"
        width="${DRAWING_RIGHT - DRAWING_LEFT}"
        height="${footerHeight}"
        fill="#ffffff"
        stroke="#111111"
        stroke-width="0.5"
      />

      <line
        x1="${logoRight}"
        y1="${FOOTER_TOP}"
        x2="${logoRight}"
        y2="${FOOTER_BOTTOM}"
        stroke="#111111"
        stroke-width="0.5"
      />

      <line
        x1="${clientRight}"
        y1="${FOOTER_TOP}"
        x2="${clientRight}"
        y2="${FOOTER_BOTTOM}"
        stroke="#111111"
        stroke-width="0.5"
      />

      <line
        x1="${dateRight}"
        y1="${FOOTER_TOP}"
        x2="${dateRight}"
        y2="${FOOTER_BOTTOM}"
        stroke="#111111"
        stroke-width="0.5"
      />

      <line
        x1="${revisionRight}"
        y1="${FOOTER_TOP}"
        x2="${revisionRight}"
        y2="${FOOTER_BOTTOM}"
        stroke="#111111"
        stroke-width="0.5"
      />

      <image
        href="${TRIEL_HT_LOGO_DATA_URI}"
        x="${DRAWING_LEFT + 5}"
        y="${FOOTER_TOP + 2}"
        width="${logoRight - DRAWING_LEFT - 10}"
        height="${footerHeight - 4}"
        preserveAspectRatio="xMidYMid meet"
      />

      ${createText(
        logoRight + 5,
        FOOTER_TOP + 6,
        "CLIENTE",
        {
          fontSize: 2.6,
          fontWeight: 700,
        }
      )}

      ${createText(
        logoRight + 5,
        FOOTER_BOTTOM - 5,
        data.cliente ?? "—",
        {
          fontSize: 4.8,
          fontWeight: 600,
        }
      )}

      ${createText(
        clientRight + 5,
        FOOTER_TOP + 6,
        "DATA DE CRIAÇÃO",
        {
          fontSize: 2.6,
          fontWeight: 700,
        }
      )}

      ${createText(
        clientRight + 5,
        FOOTER_BOTTOM - 5,
        formatDate(creationDate),
        {
          fontSize: 4.8,
          fontWeight: 600,
        }
      )}

      ${createText(
        dateRight + 5,
        FOOTER_TOP + 6,
        "REVISÃO",
        {
          fontSize: 2.6,
          fontWeight: 700,
        }
      )}

      ${createText(
        (dateRight + revisionRight) / 2,
        FOOTER_TOP + 18,
        data.codigoRevisao,
        {
          fontSize: 8,
          fontWeight: 700,
          textAnchor: "middle",
        }
      )}

      ${createText(
        revisionRight + 5,
        FOOTER_TOP + 6,
        "PESO",
        {
          fontSize: 2.6,
          fontWeight: 700,
        }
      )}

      ${createText(
        (revisionRight + DRAWING_RIGHT) / 2,
        FOOTER_BOTTOM - 5,
        formatNumber(
          data.peso,
          "kg"
        ),
        {
          fontSize: 4.8,
          fontWeight: 600,
          textAnchor: "middle",
        }
      )}
    </g>
  `;
}

function generateSiloGraneleiroSvg(
  data: ApprovalDrawingData,
  template: ProductTemplateDefinition
): string {
  if (
    !template.lateralPath ||
    !template.superiorPath
  ) {
    throw new ApprovalDrawingTemplateNotConfiguredError(
      "Silo Graneleiro"
    );
  }

  const lateral = parseTemplateSvg(
    template.lateralPath
  );

  const superior = parseTemplateSvg(
    template.superiorPath
  );

  const showLateral =
    data.tipoRepresentacao ===
      "lateral" ||
    data.tipoRepresentacao ===
      "completo";

  const showSuperior =
    data.tipoRepresentacao ===
      "superior" ||
    data.tipoRepresentacao ===
      "completo";

  let drawingContent = "";

  if (showLateral && showSuperior) {
    drawingContent = `
      ${renderView(
        "VISTA LATERAL",
        lateral,
        data,
        7,
        7,
        406,
        128,
        true
      )}

      <line
        x1="6"
        y1="138"
        x2="414"
        y2="138"
        stroke="#b8b8b8"
        stroke-width="0.3"
        stroke-dasharray="4 2"
      />

      ${renderView(
        "VISTA SUPERIOR",
        superior,
        data,
        7,
        142,
        406,
        124,
        false
      )}
    `;
  } else if (showLateral) {
    drawingContent = renderView(
      "VISTA LATERAL",
      lateral,
      data,
      7,
      8,
      406,
      256,
      true
    );
  } else {
    drawingContent = renderView(
      "VISTA SUPERIOR",
      superior,
      data,
      7,
      8,
      406,
      256,
      false
    );
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
    <svg
      xmlns="http://www.w3.org/2000/svg"
      xmlns:xlink="http://www.w3.org/1999/xlink"
      width="${PAGE_WIDTH}mm"
      height="${PAGE_HEIGHT}mm"
      viewBox="0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}"
      role="img"
      aria-labelledby="drawing-title drawing-description"
    >
      <title id="drawing-title">
        Desenho de aprovação ${escapeXml(
          data.numero
        )}
      </title>

      <desc id="drawing-description">
        Desenho de aprovação do Silo Graneleiro em formato A3 horizontal.
      </desc>

      <rect
        x="0"
        y="0"
        width="${PAGE_WIDTH}"
        height="${PAGE_HEIGHT}"
        fill="#ffffff"
      />

      <rect
        x="${DRAWING_LEFT}"
        y="${DRAWING_TOP}"
        width="${DRAWING_RIGHT - DRAWING_LEFT}"
        height="${DRAWING_BOTTOM - DRAWING_TOP}"
        fill="none"
        stroke="#111111"
        stroke-width="0.6"
      />

      ${drawingContent}

      ${renderFooter(data)}
    </svg>
  `.trim();
}

export function generateApprovalDrawingSvg(
  data: ApprovalDrawingData
): string {
  const category =
    getApprovalDrawingProductCategory(
      data.produto
    );

  const template =
    productTemplates[category];

  if (!template.configurado) {
    throw new ApprovalDrawingTemplateNotConfiguredError(
      category
    );
  }

  switch (category) {
    case "Silo Graneleiro":
      return generateSiloGraneleiroSvg(
        data,
        template
      );

    case "Aves":
    case "Suinos":
      throw new ApprovalDrawingTemplateNotConfiguredError(
        category
      );
  }
}
