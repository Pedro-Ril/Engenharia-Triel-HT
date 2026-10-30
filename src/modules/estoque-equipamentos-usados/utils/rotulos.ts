/* Rótulos compartilhados pela tela do equipamento e pelo extrato unificado. */
import type { StatusEquipamento, TipoAcaoMovimentacao } from "../types/estoque.types";

export const STATUS_LABELS: Record<StatusEquipamento, string> = {
  em_estoque: "Em estoque",
  emprestado: "Emprestado",
  consignado: "Em consignação",
  em_reforma: "Em reforma/conserto",
  baixado: "Baixado",
};

export const STATUS_BADGE: Record<StatusEquipamento, "success" | "warning" | "info" | "neutral"> = {
  em_estoque: "success",
  emprestado: "warning",
  consignado: "info",
  em_reforma: "warning",
  baixado: "neutral",
};

export const ACAO_LABELS: Record<TipoAcaoMovimentacao, string> = {
  entrada: "Entrada",
  emprestimo: "Empréstimo",
  consignacao: "Consignação",
  retorno: "Retorno ao estoque",
  reforma: "Saída para reforma/conserto",
  baixa: "Baixa",
  transferencia: "Transferência entre empresas",
  nf_vinculada: "NF de entrada vinculada",
};
