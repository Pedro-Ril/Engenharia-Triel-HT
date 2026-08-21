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

export const ESTILOS_CORES_TAG: Record<CorTag, EstiloCorTag> = {
  emerald: {
    nome: "Verde",
    dot: "#059669",
    bg: "#d1fae5",
    texto: "#065f46",
    borda: "#a7f3d0",
  },
  blue: {
    nome: "Azul",
    dot: "#2563eb",
    bg: "#dbeafe",
    texto: "#1e3a8a",
    borda: "#bfdbfe",
  },
  purple: {
    nome: "Roxo",
    dot: "#7c3aed",
    bg: "#f3e8ff",
    texto: "#6b21a8",
    borda: "#e9d5ff",
  },
  orange: {
    nome: "Laranja",
    dot: "#ea580c",
    bg: "#ffedd5",
    texto: "#9a3412",
    borda: "#fed7aa",
  },
  cyan: {
    nome: "Ciano",
    dot: "#0891b2",
    bg: "#cffafe",
    texto: "#155e75",
    borda: "#a5f3fc",
  },
  rose: {
    nome: "Rosa",
    dot: "#e11d48",
    bg: "#fee2e2",
    texto: "#b91c1c",
    borda: "#fecaca",
  },
  red: {
    nome: "Vermelho (marca)",
    dot: "#b71c1c",
    bg: "rgba(183, 28, 28, 0.08)",
    texto: "#b71c1c",
    borda: "rgba(183, 28, 28, 0.2)",
  },
  amber: {
    nome: "Âmbar",
    dot: "#d97706",
    bg: "#fef3c7",
    texto: "#92400e",
    borda: "#fde68a",
  },
  slate: {
    nome: "Cinza",
    dot: "#64748b",
    bg: "#f1f5f9",
    texto: "#334155",
    borda: "#e2e8f0",
  },
  teal: {
    nome: "Verde-azulado",
    dot: "#0d9488",
    bg: "#ccfbf1",
    texto: "#115e59",
    borda: "#99f6e4",
  },
};

export function ehCorTagValida(valor: string): valor is CorTag {
  return (CORES_TAG_DISPONIVEIS as readonly string[]).includes(valor);
}

export function getEstiloCorTag(cor: string): EstiloCorTag {
  return ESTILOS_CORES_TAG[ehCorTagValida(cor) ? cor : "slate"];
}
