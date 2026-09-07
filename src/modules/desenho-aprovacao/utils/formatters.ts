import type {
  ApprovalRepresentation,
  ApprovalStatus,
  RevisionStatus,
} from "@/modules/desenho-aprovacao/types/approval";

export function formatDate(value: string | null) {
  if (!value) {
    return "—";
  }

  const datePart = value.slice(0, 10);
  const [year, month, day] = datePart.split("-");

  if (!year || !month || !day) {
    return value;
  }

  return `${day}/${month}/${year}`;
}

export function formatDateTime(value: string | null) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export function formatNumber(value: number | null, suffix?: string) {
  if (value === null) {
    return "—";
  }

  const formatted = new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 2,
  }).format(value);

  return suffix ? `${formatted} ${suffix}` : formatted;
}

export function getStatusVariant(
  status: ApprovalStatus
): "info" | "warning" | "success" | "danger" | undefined {
  switch (status) {
    case "em_aprovacao":
      return "info";

    case "pendente":
      return "warning";

    case "aprovado":
      return "success";

    case "reprovado":
      return "danger";

    default:
      return undefined;
  }
}

export function getRepresentationLabel(representation: ApprovalRepresentation) {
  switch (representation) {
    case "lateral":
      return "Vista lateral";

    case "superior":
      return "Vista superior";

    case "completo":
      return "Representação completa";
  }
}

export function getBooleanLabel(value: boolean) {
  return value ? "Sim" : "Não";
}

export function getRevisionStatusLabel(status: RevisionStatus) {
  switch (status) {
    case "gerando":
      return "Gerando";

    case "gerado":
      return "Gerado";

    case "em_aprovacao":
      return "Em aprovação";

    case "ajustes_solicitados":
      return "Ajustes solicitados";

    case "aprovado":
      return "Aprovado";

    case "reprovado":
      return "Reprovado";

    case "erro":
      return "Erro";
  }
}

export function getRevisionStatusVariant(
  status: RevisionStatus
): "info" | "warning" | "success" | "danger" | undefined {
  switch (status) {
    case "gerando":
    case "gerado":
    case "em_aprovacao":
      return "info";

    case "ajustes_solicitados":
      return "warning";

    case "aprovado":
      return "success";

    case "reprovado":
    case "erro":
      return "danger";

    default:
      return undefined;
  }
}

export function getHistoryActionLabel(action: string) {
  switch (action) {
    case "CRIADO":
      return "Desenho criado";

    case "ATUALIZADO":
      return "Dados atualizados";

    case "ENVIADO_APROVACAO":
      return "Revisão enviada para aprovação";

    case "APROVADO":
      return "Revisão aprovada";

    case "AJUSTES_SOLICITADOS":
      return "Ajustes solicitados";

    case "REPROVADO":
      return "Revisão reprovada";

    case "REABERTO_REVISAO":
      return "Desenho reaberto";

    case "EXCLUIDO":
      return "Desenho excluído";

    default:
      return action
        .toLowerCase()
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
  }
}

export function getHistoryActionVariant(
  action: string
): "info" | "warning" | "success" | "danger" | undefined {
  switch (action) {
    case "CRIADO":
    case "ENVIADO_APROVACAO":
      return "info";

    case "AJUSTES_SOLICITADOS":
    case "REABERTO_REVISAO":
      return "warning";

    case "APROVADO":
      return "success";

    case "REPROVADO":
    case "EXCLUIDO":
      return "danger";

    default:
      return undefined;
  }
}

export function getHistoryRevisionCode(data: unknown): string | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return null;
  }

  const record = data as Record<string, unknown>;
  const codigoRevisao = record.codigoRevisao;

  if (typeof codigoRevisao === "string" && codigoRevisao.trim()) {
    return codigoRevisao.trim();
  }

  const revisaoAnterior = record.revisaoAnterior;

  if (typeof revisaoAnterior === "string" && revisaoAnterior.trim()) {
    return revisaoAnterior.trim();
  }

  return null;
}
