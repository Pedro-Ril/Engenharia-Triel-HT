/*
 * Empresas do Focco que mandam pedido de compra para aprovação. Fica
 * FORA de pedidos-compra.ts ("server-only") porque a tela de
 * administração monta as caixas de escopo a partir desta lista.
 *
 * O número é o empr_id do Focco -- o mesmo que o SupriConnect manda no
 * campo `empresa` do envio.
 */

export interface EmpresaPedidoCompra {
  codigo: number;
  nome: string;
}

export const EMPRESAS_PEDIDO_COMPRA: EmpresaPedidoCompra[] = [
  { codigo: 2, nome: "Triel-HT" },
  { codigo: 30, nome: "Usitec" },
  { codigo: 40, nome: "Versátil" },
];

export function ehEmpresaPedidoCompra(valor: unknown): valor is number {
  return typeof valor === "number" && EMPRESAS_PEDIDO_COMPRA.some((empresa) => empresa.codigo === valor);
}

export function nomeEmpresaPedidoCompra(codigo: number): string {
  return EMPRESAS_PEDIDO_COMPRA.find((empresa) => empresa.codigo === codigo)?.nome ?? `Empresa ${codigo}`;
}
