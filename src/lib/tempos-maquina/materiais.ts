/*
 * Material da peça pela descrição da matéria-prima (cadastro
 * eng_tempos_materiais): o primeiro material ativo, na ordem, com alguma
 * palavra que comece uma palavra da descrição ("ALUM" pega "ALUMINIO").
 * Sem acento e sem diferença de maiúsculas.
 */

type MaterialComTermos = { termos: string; ativo: boolean; ordem: number };

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
}

function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function identificarMaterial<T extends MaterialComTermos>(descricao: string | null | undefined, materiais: T[]): T | null {
  const texto = normalizar(String(descricao ?? ""));
  if (!texto.trim()) return null;

  const ordenados = materiais.filter((m) => m.ativo).sort((a, b) => a.ordem - b.ordem);
  for (const material of ordenados) {
    const termos = material.termos
      .split(",")
      .map((t) => normalizar(t.trim()))
      .filter(Boolean);
    if (termos.some((termo) => new RegExp(`(^|[^A-Z0-9])${escaparRegex(termo)}`).test(texto))) return material;
  }

  return null;
}
