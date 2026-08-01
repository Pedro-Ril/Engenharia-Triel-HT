"use client";

import type { ReactNode } from "react";
import { AlertTriangle, CircleHelp, Trash2 } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Stack } from "@/components/ui/Stack";

type ConfirmDialogVariant =
  | "default"
  | "warning"
  | "danger";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmDialogVariant;
  loading?: boolean;
  closeOnOverlay?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

const variantConfig = {
  default: {
    alertVariant: "info" as const,
    icon: <CircleHelp />,
  },
  warning: {
    alertVariant: "warning" as const,
    icon: <AlertTriangle />,
  },
  danger: {
    alertVariant: "danger" as const,
    icon: <Trash2 />,
  },
};

export function ConfirmDialog({
  open,
  title,
  description,
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  variant = "default",
  loading = false,
  closeOnOverlay = true,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const config = variantConfig[variant];

  return (
    <Modal
      open={open}
      title={title}
      description={description}
      size="small"
      closeOnOverlay={closeOnOverlay && !loading}
      onClose={() => {
        if (!loading) {
          onClose();
        }
      }}
      footer={
        <Stack
          direction="row"
          gap={10}
          justify="end"
          wrap
        >
          <Button
            variant="secondary"
            disabled={loading}
            onClick={onClose}
          >
            {cancelLabel}
          </Button>

          <Button
            variant={
              variant === "danger"
                ? "danger"
                : "primary"
            }
            disabled={loading}
            onClick={onConfirm}
          >
            {loading
              ? "Processando..."
              : confirmLabel}
          </Button>
        </Stack>
      }
    >
      <Alert
        variant={config.alertVariant}
        icon={config.icon}
      >
        {message}
      </Alert>
    </Modal>
  );
}