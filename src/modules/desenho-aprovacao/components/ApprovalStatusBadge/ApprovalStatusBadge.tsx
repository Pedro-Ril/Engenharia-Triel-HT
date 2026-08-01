import { Badge } from "@/components/ui/Badge";

import {
  getApprovalStatusConfig,
} from "../../constants";

import type {
  ApprovalStatus,
} from "../../types";

interface ApprovalStatusBadgeProps {
  status?: ApprovalStatus;
}

export function ApprovalStatusBadge({
  status = "rascunho",
}: ApprovalStatusBadgeProps) {
  const config = getApprovalStatusConfig(status);

  return (
    <Badge variant={config.badgeVariant}>
      {config.label}
    </Badge>
  );
}