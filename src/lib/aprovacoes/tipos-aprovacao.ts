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

export type TipoAprovacao = "aumento_salarial";

export interface DefinicaoTipoAprovacao {
  valor: TipoAprovacao;
  label: string;
  descricao: string;
}

export const TIPOS_APROVACAO: DefinicaoTipoAprovacao[] = [
  {
    valor: "aumento_salarial",
    label: "Reajuste Salarial",
    descricao: "Reajustes de salário enviados pelas lideranças para a direção decidir.",
  },
];

export function ehTipoAprovacao(valor: unknown): valor is TipoAprovacao {
  return typeof valor === "string" && TIPOS_APROVACAO.some((tipo) => tipo.valor === valor);
}

export function rotuloTipoAprovacao(valor: TipoAprovacao): string {
  return TIPOS_APROVACAO.find((tipo) => tipo.valor === valor)?.label ?? valor;
}
