/*
 * Registro dos tipos de aprovação que o painel da direção atende.
 * Fica FORA de aprovacoes.ts (que é "server-only") de propósito: a tela
 * de administração precisa dos rótulos no cliente pra montar a grade de
 * aprovadores.
 *
 * Um tipo novo (férias, desligamento, compra acima de X...) entra aqui
 * junto do código que o implementa -- não é cadastro de banco, porque
 * cada tipo precisa de tabela de item e tela próprias de qualquer jeito.
 */

export type TipoAprovacao = "aumento_salarial" | "pedido_compra";

export interface DefinicaoTipoAprovacao {
  valor: TipoAprovacao;
  label: string;
  descricao: string;
  /* Nome do ícone no catálogo do portal (src/lib/icons/icon-registry.ts) -- o mesmo do módulo. */
  icone: string;
  /*
   * O que a solicitação deste tipo carrega para escolher a alçada:
   * reajuste conhece o setor do colaborador (o RH não traz empresa);
   * pedido de compra, a empresa do Focco.
   */
  criteriosAlcada: CriterioAlcada[];
  /* As sugestões de direcionamento podem olhar o centro de custo dos itens. */
  centroCustoNaSugestao: boolean;
}

export type CriterioAlcada = "empresa" | "setor";

export const TIPOS_APROVACAO: DefinicaoTipoAprovacao[] = [
  {
    valor: "aumento_salarial",
    label: "Reajuste Salarial",
    descricao: "Reajustes de salário enviados pelas lideranças para a direção decidir.",
    icone: "TrendingUp",
    criteriosAlcada: ["setor"],
    centroCustoNaSugestao: false,
  },
  {
    valor: "pedido_compra",
    label: "Pedidos de Compra",
    descricao: "Pedidos de compra do Focco enviados pelo SupriConnect, das empresas marcadas em Pedidos de Compra.",
    icone: "ShoppingCart",
    criteriosAlcada: ["empresa"],
    centroCustoNaSugestao: true,
  },
];

export function ehTipoAprovacao(valor: unknown): valor is TipoAprovacao {
  return typeof valor === "string" && TIPOS_APROVACAO.some((tipo) => tipo.valor === valor);
}

export function rotuloTipoAprovacao(valor: TipoAprovacao): string {
  return TIPOS_APROVACAO.find((tipo) => tipo.valor === valor)?.label ?? valor;
}

export function iconeTipoAprovacao(valor: TipoAprovacao): string {
  return TIPOS_APROVACAO.find((tipo) => tipo.valor === valor)?.icone ?? "Folder";
}

export function criteriosAlcadaDoTipo(valor: TipoAprovacao): CriterioAlcada[] {
  return TIPOS_APROVACAO.find((tipo) => tipo.valor === valor)?.criteriosAlcada ?? [];
}

export function centroCustoNaSugestaoDoTipo(valor: TipoAprovacao): boolean {
  return TIPOS_APROVACAO.find((tipo) => tipo.valor === valor)?.centroCustoNaSugestao ?? false;
}
