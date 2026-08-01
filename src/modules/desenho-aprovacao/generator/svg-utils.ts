export interface ParsedSvgContent {
  viewBox: {
    minX: number;
    minY: number;
    width: number;
    height: number;
  };
  innerContent: string;
}

const viewBoxRegex =
  /viewBox\s*=\s*"([^"]+)"/i;

const svgOpenTagRegex =
  /<svg\b[^>]*>/i;

const svgCloseTagRegex =
  /<\/svg>\s*$/i;

export function parseSvgContent(
  svg: string
): ParsedSvgContent {
  const normalizedSvg = String(svg || "").trim();

  const viewBoxMatch =
    normalizedSvg.match(viewBoxRegex);

  if (!viewBoxMatch) {
    throw new Error(
      "O SVG base não possui viewBox."
    );
  }

  const viewBoxParts = viewBoxMatch[1]
    .trim()
    .split(/\s+/)
    .map(Number);

  if (
    viewBoxParts.length !== 4 ||
    viewBoxParts.some((value) =>
      Number.isNaN(value)
    )
  ) {
    throw new Error(
      "O viewBox do SVG base é inválido."
    );
  }

  const [minX, minY, width, height] =
    viewBoxParts;

  const innerContent = normalizedSvg
    .replace(svgOpenTagRegex, "")
    .replace(svgCloseTagRegex, "")
    .trim();

  return {
    viewBox: {
      minX,
      minY,
      width,
      height,
    },
    innerContent,
  };
}

export interface FitBoxOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  padding?: number;
}

export function buildFittedSvgGroup(
  svg: string,
  options: FitBoxOptions
) {
  const {
    x,
    y,
    width,
    height,
    padding = 0,
  } = options;

  const parsed = parseSvgContent(svg);

  const availableWidth =
    width - padding * 2;

  const availableHeight =
    height - padding * 2;

  const scaleX =
    availableWidth /
    parsed.viewBox.width;

  const scaleY =
    availableHeight /
    parsed.viewBox.height;

  const scale = Math.min(
    scaleX,
    scaleY
  );

  const scaledWidth =
    parsed.viewBox.width * scale;

  const scaledHeight =
    parsed.viewBox.height * scale;

  const offsetX =
    x +
    padding +
    (availableWidth - scaledWidth) / 2;

  const offsetY =
    y +
    padding +
    (availableHeight - scaledHeight) / 2;

  const translateX =
    offsetX - parsed.viewBox.minX * scale;

  const translateY =
    offsetY - parsed.viewBox.minY * scale;

  return `
    <g transform="translate(${translateX}, ${translateY}) scale(${scale})">
      ${parsed.innerContent}
    </g>
  `;
}