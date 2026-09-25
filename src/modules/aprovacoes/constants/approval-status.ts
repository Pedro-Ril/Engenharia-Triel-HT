import type { StatusAprovacao } from "../types/aprovacoes.types";

export type StatusAprovacaoBadgeVariant = "warning" | "success" | "danger";

export interface StatusAprovacaoConfig {
  label: string;
  badgeVariant: StatusAprovacaoBadgeVariant;
}

export const statusAprovacaoConfig: Record<StatusAprovacao, StatusAprovacaoConfig> = {
  pendente: { label: "Pendente", badgeVariant: "warning" },
  aprovado: { label: "Aprovado", badgeVariant: "success" },
  reprovado: { label: "Reprovado", badgeVariant: "danger" },
};
