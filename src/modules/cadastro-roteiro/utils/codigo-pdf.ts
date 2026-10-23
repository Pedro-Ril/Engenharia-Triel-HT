/*
 * Por qual código procurar o PDF do item. Peça Ciber (estrutura do ERP)
 * tem o desenho com código próprio (COD_DESENHO), diferente do código do
 * item; nas demais, o PDF leva o código do item. Sem desenho cadastrado
 * (ex.: componente comprado), fica o código do item mesmo.
 */
export function codigoDoPdf(item: {
  origem?: "3dx" | "erp";
  codigoDesenho?: string;
  codigoNormalizado: string;
}): string {
  if (item.origem === "erp" && item.codigoDesenho) return item.codigoDesenho;
  return item.codigoNormalizado;
}
