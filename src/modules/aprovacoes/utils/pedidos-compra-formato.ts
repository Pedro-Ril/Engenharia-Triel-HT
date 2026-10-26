import type { PedidoCompraPainel } from "../types/aprovacoes.types";

/*
 * Formatação e totais da aba Pedidos de Compra do painel -- separado dos
 * componentes para poder ser testado (pedidos-compra-formato.test.ts).
 */

/* Pedido em outra moeda: o número com a moeda escrita, sem forçar "R$". */
export function formatarValor(valor: number | null, moeda: string | null): string {
  if (valor === null) return "-";
  if (moeda) {
    return `${moeda} ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/* "2026-10-26" -> "26/10/2026" sem passar por Date (sem susto de fuso). */
export function formatarDataCurta(valorIso: string | null): string {
  if (!valorIso) return "-";
  const [ano, mes, dia] = valorIso.slice(0, 10).split("-");
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : "-";
}

/* CNPJ/CPF só com dígitos (como vem do ERP) -> com máscara. Outro tamanho volta como veio. */
export function formatarDocumento(valor: string): string {
  const d = valor.replace(/[^0-9]/g, "");
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  return valor;
}

export interface TotaisPedidos {
  quantidade: number;
  /* Soma por moeda: "" = real. Pedido em euro não entra na soma em reais. */
  porMoeda: Map<string, number>;
  /* Pedidos sem valor (sem a foto do ERP). */
  semValor: number;
}

export function somarPedidos(pedidos: Pick<PedidoCompraPainel, "valorTotal" | "moeda">[]): TotaisPedidos {
  const porMoeda = new Map<string, number>();
  let semValor = 0;

  for (const pedido of pedidos) {
    if (pedido.valorTotal === null) {
      semValor += 1;
      continue;
    }
    const moeda = pedido.moeda ?? "";
    porMoeda.set(moeda, (porMoeda.get(moeda) ?? 0) + pedido.valorTotal);
  }

  return { quantidade: pedidos.length, porMoeda, semValor };
}

/* "R$ 4.294,62 + EUR 120,00" -- real primeiro, depois as outras moedas em ordem alfabética. */
export function resumirTotais(porMoeda: Map<string, number>): string {
  if (porMoeda.size === 0) return "-";
  return [...porMoeda.entries()]
    .sort(([a], [b]) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b)))
    .map(([moeda, valor]) => formatarValor(valor, moeda || null))
    .join(" + ");
}
