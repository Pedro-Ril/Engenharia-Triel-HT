/*
 * Campo do tipo por condição do equipamento (usado/novo): para quem ele
 * aparece ("condicao") e se é obrigatório no novo ("obrigatorioNovo"; o
 * "obrigatorio" de sempre vale para o usado). Usado pela tela e pelo
 * servidor (função pura, sem dependências).
 */

export type CondicaoCampo = "ambos" | "usado" | "novo";
export type CondicaoDoEquipamento = "usado" | "novo";

export function campoValeParaCondicao(campo: { condicao: CondicaoCampo }, condicao: CondicaoDoEquipamento): boolean {
  return campo.condicao === "ambos" || campo.condicao === condicao;
}

/*
 * Os campos como valem para aquela condição: tira os que não aparecem e,
 * no novo, troca "obrigatorio" pelo obrigatório do novo -- assim todo o
 * resto (validação, asterisco, pendência) segue lendo só "obrigatorio".
 */
export function camposParaCondicao<T extends { condicao: CondicaoCampo; obrigatorio: boolean; obrigatorioNovo: boolean }>(
  campos: T[],
  condicao: CondicaoDoEquipamento
): T[] {
  return campos
    .filter((campo) => campoValeParaCondicao(campo, condicao))
    .map((campo) => (condicao === "novo" ? { ...campo, obrigatorio: campo.obrigatorioNovo } : campo));
}
