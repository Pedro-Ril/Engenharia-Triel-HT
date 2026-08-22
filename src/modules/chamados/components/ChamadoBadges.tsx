import { Badge } from "@/components/ui/Badge";
import type { PrioridadeChamado, StatusChamado } from "../types/chamados.types";

const STATUS_CONFIG: Record<
  StatusChamado,
  { label: string; variant: "neutral" | "success" | "warning" | "danger" | "info" }
> = {
  aberto: { label: "Aberto", variant: "info" },
  em_andamento: { label: "Em andamento", variant: "warning" },
  aguardando_confirmacao: { label: "Aguardando confirmação", variant: "warning" },
  resolvido: { label: "Resolvido", variant: "success" },
  fechado: { label: "Fechado", variant: "neutral" },
};

const PRIORIDADE_CONFIG: Record<
  PrioridadeChamado,
  { label: string; variant: "neutral" | "success" | "warning" | "danger" | "info" }
> = {
  baixa: { label: "Baixa", variant: "neutral" },
  media: { label: "Média", variant: "info" },
  alta: { label: "Alta", variant: "warning" },
  urgente: { label: "Urgente", variant: "danger" },
};

export function StatusBadge({ status }: { status: StatusChamado }) {
  const config = STATUS_CONFIG[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export function PrioridadeBadge({ prioridade }: { prioridade: PrioridadeChamado }) {
  const config = PRIORIDADE_CONFIG[prioridade];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export const STATUS_LABELS = STATUS_CONFIG;
export const PRIORIDADE_LABELS = PRIORIDADE_CONFIG;
