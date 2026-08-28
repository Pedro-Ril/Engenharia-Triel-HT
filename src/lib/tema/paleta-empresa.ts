import "server-only";

/*
 * Deriva as variações de uma cor principal (hover, active, fundo suave,
 * anel de foco) do mesmo jeito que o vermelho padrão já se relaciona hoje
 * em globals.css: hover/active são a própria cor escurecida em L (HSL), e
 * soft/soft-strong/soft-border/ring são a cor em rgba nas mesmas opacidades
 * já usadas (0.08 / 0.13 / 0.2 / 0.12) — só troca o matiz, mantém a
 * "linguagem visual" atual.
 */

interface RgbColor {
  r: number;
  g: number;
  b: number;
}

interface HslColor {
  h: number;
  s: number;
  l: number;
}

export function corHexValida(valor: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(valor);
}

function hexParaRgb(hex: string): RgbColor {
  const valor = hex.replace("#", "");
  return {
    r: parseInt(valor.slice(0, 2), 16),
    g: parseInt(valor.slice(2, 4), 16),
    b: parseInt(valor.slice(4, 6), 16),
  };
}

function rgbParaHsl({ r, g, b }: RgbColor): HslColor {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;

  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

  return { h, s: s * 100, l: l * 100 };
}

function hslParaRgb({ h, s, l }: HslColor): RgbColor {
  const sn = s / 100;
  const ln = l / 100;

  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = ln - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;

  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

function rgbParaHex({ r, g, b }: RgbColor): string {
  const canal = (valor: number) => valor.toString(16).padStart(2, "0");
  return `#${canal(r)}${canal(g)}${canal(b)}`;
}

function escurecer(hex: string, pontosPercentuais: number): string {
  const hsl = rgbParaHsl(hexParaRgb(hex));
  const lNovo = Math.max(0, hsl.l - pontosPercentuais);
  return rgbParaHex(hslParaRgb({ ...hsl, l: lNovo }));
}

function rgba(hex: string, alfa: number): string {
  const { r, g, b } = hexParaRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alfa})`;
}

export interface TokensDeCor {
  primary: string;
  primaryHover: string;
  primaryActive: string;
  primaryRgb: string;
  primarySoft: string;
  primarySoftStrong: string;
  primarySoftBorder: string;
  primaryRing: string;
  sidebarGradient: string;
  bgHoverBrand: string;
  tagRedDot: string;
  tagRedBg: string;
  tagRedText: string;
  tagRedBorder: string;
}

/*
 * `--bg-hover-brand` (fundo de hover em Table/Dropdown/Breadcrumb/etc.) e
 * a paleta de tag "Red" (`--tag-red-*`, uma das 10 opções fixas em
 * Atualizações) também são amarradas à cor de marca em globals.css — sem
 * derivá-las aqui, elas continuavam vermelhas mesmo com outra empresa
 * aplicada (é exatamente o bug relatado: fundo/hover não seguiam a
 * paleta).
 *
 * `--primary-rgb` (só "r, g, b", sem `rgba()`) existe pra todo o resto do
 * app que precisa de uma opacidade "avulsa" que nenhum dos tokens acima
 * cobre (glows, sombras, gradientes específicos de cada tela) — em vez de
 * cada CSS Module hardcodar `rgba(183, 28, 28, 0.34)` (o que já
 * aconteceu bastante, sempre preso ao vermelho), ele referencia
 * `rgba(var(--primary-rgb), 0.34)` e acompanha a empresa também.
 */
export function derivarTokensDeCor(corBase: string): TokensDeCor {
  const hover = escurecer(corBase, 10);
  const active = escurecer(corBase, 18);
  const { r, g, b } = hexParaRgb(corBase);

  return {
    primary: corBase,
    primaryHover: hover,
    primaryActive: active,
    primaryRgb: `${r}, ${g}, ${b}`,
    primarySoft: rgba(corBase, 0.08),
    primarySoftStrong: rgba(corBase, 0.13),
    primarySoftBorder: rgba(corBase, 0.2),
    primaryRing: rgba(corBase, 0.12),
    sidebarGradient: `linear-gradient(180deg, ${corBase} 0%, ${hover} 55%, ${active} 100%)`,
    bgHoverBrand: rgba(corBase, 0.08),
    tagRedDot: corBase,
    tagRedBg: rgba(corBase, 0.08),
    tagRedText: corBase,
    tagRedBorder: rgba(corBase, 0.2),
  };
}

function blocoTokens(tokens: TokensDeCor): string {
  return `
    --primary: ${tokens.primary};
    --primary-hover: ${tokens.primaryHover};
    --primary-active: ${tokens.primaryActive};
    --primary-rgb: ${tokens.primaryRgb};
    --primary-soft: ${tokens.primarySoft};
    --primary-soft-strong: ${tokens.primarySoftStrong};
    --primary-soft-border: ${tokens.primarySoftBorder};
    --primary-ring: ${tokens.primaryRing};
    --sidebar-gradient: ${tokens.sidebarGradient};
    --bg-hover-brand: ${tokens.bgHoverBrand};
    --tag-red-dot: ${tokens.tagRedDot};
    --tag-red-bg: ${tokens.tagRedBg};
    --tag-red-text: ${tokens.tagRedText};
    --tag-red-border: ${tokens.tagRedBorder};
  `;
}

/*
 * Usa um seletor de atributo em `html` (em vez de `:root[...]`, que é o
 * que globals.css usa) de propósito — tem mais especificidade que os
 * tokens padrão (`:root`/`:root[data-theme]`), então essa sobrescrita
 * sempre vence independente da ordem de carregamento do <style>.
 */
function montarCssComSeletor(seletor: string, corClara: string, corEscura: string): string {
  const tokensClaro = derivarTokensDeCor(corClara);
  const tokensEscuro = derivarTokensDeCor(corEscura);

  return `
${seletor} {
  ${blocoTokens(tokensClaro)}
}
@media (prefers-color-scheme: dark) {
  ${seletor}:not([data-theme="light"]) {
    ${blocoTokens(tokensEscuro)}
  }
}
${seletor}[data-theme="dark"] {
  ${blocoTokens(tokensEscuro)}
}
`.trim();
}

export function montarCssEmpresa(empresaId: string, corClara: string, corEscura: string): string {
  return montarCssComSeletor(`html[data-empresa="${empresaId}"]`, corClara, corEscura);
}

/*
 * Mesma mecânica de montarCssEmpresa, só que pro tema padrão do portal
 * (quando o usuário não está vinculado a nenhuma empresa) — ver
 * src/lib/tema/tema-padrao.ts e resolverEmpresaDoUsuario. Escopado por
 * `data-tema-padrao` em vez de `data-empresa` pra nunca colidir com uma
 * sobrescrita de empresa aplicada ao mesmo <html>.
 */
export function montarCssTemaPadrao(corClara: string, corEscura: string): string {
  return montarCssComSeletor(`html[data-tema-padrao="custom"]`, corClara, corEscura);
}
