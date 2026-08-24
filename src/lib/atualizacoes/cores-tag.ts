/*
 * Paleta fixa de cores para as tags de atualização — o admin
 * escolhe uma dessas ao criar/editar uma tag, em vez de uma
 * cor livre. Mantém o visual consistente conforme a lista de
 * módulos/categorias cresce. Sem "server-only": usado tanto
 * no formulário de admin quanto na tela pública.
 */
export const CORES_TAG_DISPONIVEIS = [
  "emerald",
  "blue",
  "purple",
  "orange",
  "cyan",
  "rose",
  "red",
  "amber",
  "slate",
  "teal",
] as const;

export type CorTag = (typeof CORES_TAG_DISPONIVEIS)[number];

export interface EstiloCorTag {
  nome: string;
  dot: string;
  bg: string;
  texto: string;
  borda: string;
}

/*
 * Os valores apontam para os tokens `--tag-*` definidos em
 * globals.css (com par claro/escuro) em vez de hexadecimais fixos
 * — assim as tags acompanham o modo noturno automaticamente,
 * já que são aplicadas via `style={{...}}` (CSS var funciona
 * normalmente em propriedades de estilo inline).
 */
export const ESTILOS_CORES_TAG: Record<CorTag, EstiloCorTag> = {
  emerald: {
    nome: "Verde",
    dot: "var(--tag-emerald-dot)",
    bg: "var(--tag-emerald-bg)",
    texto: "var(--tag-emerald-text)",
    borda: "var(--tag-emerald-border)",
  },
  blue: {
    nome: "Azul",
    dot: "var(--tag-blue-dot)",
    bg: "var(--tag-blue-bg)",
    texto: "var(--tag-blue-text)",
    borda: "var(--tag-blue-border)",
  },
  purple: {
    nome: "Roxo",
    dot: "var(--tag-purple-dot)",
    bg: "var(--tag-purple-bg)",
    texto: "var(--tag-purple-text)",
    borda: "var(--tag-purple-border)",
  },
  orange: {
    nome: "Laranja",
    dot: "var(--tag-orange-dot)",
    bg: "var(--tag-orange-bg)",
    texto: "var(--tag-orange-text)",
    borda: "var(--tag-orange-border)",
  },
  cyan: {
    nome: "Ciano",
    dot: "var(--tag-cyan-dot)",
    bg: "var(--tag-cyan-bg)",
    texto: "var(--tag-cyan-text)",
    borda: "var(--tag-cyan-border)",
  },
  rose: {
    nome: "Rosa",
    dot: "var(--tag-rose-dot)",
    bg: "var(--tag-rose-bg)",
    texto: "var(--tag-rose-text)",
    borda: "var(--tag-rose-border)",
  },
  red: {
    nome: "Vermelho (marca)",
    dot: "var(--tag-red-dot)",
    bg: "var(--tag-red-bg)",
    texto: "var(--tag-red-text)",
    borda: "var(--tag-red-border)",
  },
  amber: {
    nome: "Âmbar",
    dot: "var(--tag-amber-dot)",
    bg: "var(--tag-amber-bg)",
    texto: "var(--tag-amber-text)",
    borda: "var(--tag-amber-border)",
  },
  slate: {
    nome: "Cinza",
    dot: "var(--tag-slate-dot)",
    bg: "var(--tag-slate-bg)",
    texto: "var(--tag-slate-text)",
    borda: "var(--tag-slate-border)",
  },
  teal: {
    nome: "Verde-azulado",
    dot: "var(--tag-teal-dot)",
    bg: "var(--tag-teal-bg)",
    texto: "var(--tag-teal-text)",
    borda: "var(--tag-teal-border)",
  },
};

export function ehCorTagValida(valor: string): valor is CorTag {
  return (CORES_TAG_DISPONIVEIS as readonly string[]).includes(valor);
}

export function getEstiloCorTag(cor: string): EstiloCorTag {
  return ESTILOS_CORES_TAG[ehCorTagValida(cor) ? cor : "slate"];
}
