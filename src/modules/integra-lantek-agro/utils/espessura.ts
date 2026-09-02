export function formatarEspessura(value: unknown): string {
  if (value === null || value === undefined) return "";

  const texto = String(value).trim();
  if (!texto) return "";

  const normalizado = texto.replace(",", ".");
  const numero = Number(normalizado);

  if (Number.isNaN(numero)) return "";

  return numero.toFixed(2).replace(".", ",");
}

const PADRAO_ESPESSURA_MP =
  /(\d+(?:[.,]\d+)?)\s*[xX]\s*\d+(?:[.,]\d+)?\s*[xX]\s*\d+(?:[.,]\d+)?/;

export function extrairEspessuraDaDescricaoMp(
  descricaoMp: string | null | undefined
): string {
  const texto = String(descricaoMp ?? "").trim();
  if (!texto) return "";

  const match = texto.match(PADRAO_ESPESSURA_MP);
  if (!match) return "";

  return formatarEspessura(match[1]);
}

function normalizarTexto(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
}

type RegraMaterial = {
  material: string;
  test: (textoNormalizado: string) => boolean;
};

const REGRAS_MATERIAL: RegraMaterial[] = [
  { material: "INOX", test: (t) => t.includes("INOX") },
  {
    material: "ALUMINIO XADREZ DIAMOND",
    test: (t) =>
      t.includes("ALUMINIO") && t.includes("XADREZ") && t.includes("DIAMOND"),
  },
  {
    material: "ALUMINIO XADREZ",
    test: (t) => t.includes("ALUMINIO") && t.includes("XADREZ"),
  },
  { material: "ALUMINIO", test: (t) => t.includes("ALUMINIO") },
  {
    material: "AÇO GALVANIZADO",
    test: (t) =>
      t.includes("ACO") && (t.includes("ZINCAD") || t.includes("GALVANIZAD")),
  },
  {
    material: "AÇO CARBONO XADREZ",
    test: (t) => t.includes("ACO") && t.includes("XADREZ"),
  },
  { material: "AÇO CARBONO", test: (t) => t.includes("ACO") },
];

export function inferirMaterialDaDescricaoMp(
  descricaoMp: string | null | undefined
): string {
  const texto = normalizarTexto(String(descricaoMp ?? "").trim());
  if (!texto) return "";

  const regra = REGRAS_MATERIAL.find((r) => r.test(texto));
  return regra?.material ?? "";
}
