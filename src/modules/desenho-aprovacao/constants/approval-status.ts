import type {
  ApprovalStatus,
} from "../types";

export type ApprovalStatusBadgeVariant =
  | "info"
  | "warning"
  | "success"
  | "danger";

export interface ApprovalStatusConfig {
  label: string;
  description: string;
  badgeVariant?: ApprovalStatusBadgeVariant;
}

export const approvalStatusConfig: Record<
  ApprovalStatus,
  ApprovalStatusConfig
> = {
  rascunho: {
    label: "Rascunho",
    description:
      "O desenho foi iniciado, mas ainda não foi enviado para aprovação.",
  },

  em_aprovacao: {
    label: "Em aprovação",
    description:
      "O desenho foi enviado e está aguardando análise.",
    badgeVariant: "info",
  },

  pendente: {
    label: "Pendente",
    description:
      "Existem informações ou correções pendentes.",
    badgeVariant: "warning",
  },

  aprovado: {
    label: "Aprovado",
    description:
      "O desenho foi analisado e aprovado.",
    badgeVariant: "success",
  },

  reprovado: {
    label: "Reprovado",
    description:
      "O desenho foi analisado e não foi aprovado.",
    badgeVariant: "danger",
  },
};

export function getApprovalStatusConfig(
  status?: ApprovalStatus
): ApprovalStatusConfig {
  return approvalStatusConfig[
    status ?? "rascunho"
  ];
}