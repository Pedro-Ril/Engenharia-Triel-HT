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

/* "9002204" -> "90.02.204": os dois primeiros grupos como a regra de direcionamento escreve (90.02). */
export function formatarCentroCusto(codigo: string): string {
  const d = codigo.replace(/[^0-9]/g, "");
  return d.length > 4 ? `${d.slice(0, 2)}.${d.slice(2, 4)}.${d.slice(4)}` : codigo;
}

/* Até `maximo` centros de custo e "+N" para o resto. */
export function resumirCentrosCusto(centros: string[], maximo = 2): string {
  const mostrados = centros.slice(0, maximo).map(formatarCentroCusto).join(", ");
  return centros.length > maximo ? `${mostrados} +${centros.length - maximo}` : mostrados;
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

/* =========================================================
   Fila com volume: resumo por destino, atenção e ordenação
   ========================================================= */

export interface GrupoDestino {
  chave: string;
  /* "Darlan Dalla Roza", "Todos da Diretoria", "Aprovação final". */
  rotulo: string;
  /* Quem decide depois, em uma linha. */
  detalhe: string;
  ids: string[];
  totais: TotaisPedidos;
}

type PedidoDaFila = Pick<PedidoCompraPainel, "id" | "naMinhaVez" | "vaiPara" | "valorTotal" | "moeda">;

/*
 * Os pedidos da vez agrupados por para onde vão ao aprovar com a
 * sugestão: cada pessoa sugerida, "todos do próximo nível" e "aprovação
 * final" (quem vê é o último nível). Os grupos com mais pedidos primeiro;
 * aprovação final por último.
 */
export function agruparPorDestino(pedidos: PedidoDaFila[]): GrupoDestino[] {
  const grupos = new Map<string, { rotulo: string; detalhe: string; itens: PedidoDaFila[] }>();

  for (const pedido of pedidos) {
    if (!pedido.naMinhaVez || pedido.vaiPara === undefined) continue;

    const { chave, rotulo, detalhe } =
      pedido.vaiPara === null
        ? { chave: "final", rotulo: "Aprovação final", detalhe: "Você é o último nível" }
        : pedido.vaiPara.pessoa
          ? { chave: `pessoa:${pedido.vaiPara.pessoa.id}`, rotulo: pedido.vaiPara.pessoa.nome, detalhe: pedido.vaiPara.proximoNivel }
          : {
              chave: `todos:${pedido.vaiPara.proximoNivel}`,
              rotulo: `Todos da ${pedido.vaiPara.proximoNivel}`,
              detalhe: "Qualquer pessoa do nível",
            };

    const grupo = grupos.get(chave) ?? { rotulo, detalhe, itens: [] };
    grupo.itens.push(pedido);
    grupos.set(chave, grupo);
  }

  return [...grupos.entries()]
    .map(([chave, grupo]) => ({
      chave,
      rotulo: grupo.rotulo,
      detalhe: grupo.detalhe,
      ids: grupo.itens.map((pedido) => pedido.id),
      totais: somarPedidos(grupo.itens),
    }))
    .sort((a, b) => Number(a.chave === "final") - Number(b.chave === "final") || b.ids.length - a.ids.length);
}

/* O que foge do normal num pedido da fila -- vazio = nada a destacar. */
export function motivosAtencao(pedido: Pick<PedidoCompraPainel, "status" | "situacaoErp" | "temFoto">): string[] {
  const motivos: string[] = [];
  if (pedido.status !== "pendente") return motivos;
  if (pedido.situacaoErp === "cancelado") motivos.push("Cancelado no Focco");
  if (pedido.situacaoErp === "atendido") motivos.push("Já atendido no Focco");
  if (pedido.situacaoErp === "parcial") motivos.push("Atendido em parte no Focco");
  if (!pedido.temFoto) motivos.push("Sem os dados do ERP (fornecedor e valor)");
  return motivos;
}

export type OrdemPedidos = "fila" | "valor" | "emissao" | "empresa";

/* "fila" mantém a ordem do servidor (na vez: os mais antigos primeiro; histórico: decididos mais recentes). */
export function ordenarPedidos<P extends Pick<PedidoCompraPainel, "valorTotal" | "dataEmissao" | "empresa" | "numero">>(
  pedidos: P[],
  ordem: OrdemPedidos
): P[] {
  if (ordem === "fila") return pedidos;
  const copia = [...pedidos];
  if (ordem === "valor") return copia.sort((a, b) => (b.valorTotal ?? -1) - (a.valorTotal ?? -1));
  if (ordem === "emissao") return copia.sort((a, b) => (a.dataEmissao ?? "9999").localeCompare(b.dataEmissao ?? "9999"));
  return copia.sort((a, b) => a.empresa - b.empresa || a.numero - b.numero);
}
