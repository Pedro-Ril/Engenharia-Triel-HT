"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  CheckCircle2,
  Info,
  TriangleAlert,
  X,
} from "lucide-react";

import styles from "./Toast.module.css";

type ToastVariant =
  | "info"
  | "success"
  | "warning"
  | "danger";

type ToastPosition =
  | "top-right"
  | "top-left"
  | "bottom-right"
  | "bottom-left";

interface ToastProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  variant?: ToastVariant;
  position?: ToastPosition;
  duration?: number;
  onClose: () => void;
}

const icons = {
  info: Info,
  success: CheckCircle2,
  warning: TriangleAlert,
  danger: AlertCircle,
};

export function Toast({
  open,
  title,
  description,
  variant = "info",
  position = "top-right",
  duration = 4000,
  onClose,
}: ToastProps) {
  const [mounted, setMounted] = useState(false);
  const Icon = icons[variant];

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || duration <= 0) {
      return;
    }

    const timeout = window.setTimeout(() => {
      onClose();
    }, duration);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [duration, onClose, open]);

  if (!mounted || !open) {
    return null;
  }

  return createPortal(
    <div
      className={[
        styles.viewport,
        styles[position],
      ].join(" ")}
    >
      <div
        className={[
          styles.toast,
          styles[variant],
        ].join(" ")}
        role={variant === "danger" ? "alert" : "status"}
        aria-live={variant === "danger" ? "assertive" : "polite"}
      >
        <div className={styles.iconWrapper} aria-hidden="true">
          <Icon />
        </div>

        <div className={styles.content}>
          <strong className={styles.title}>
            {title}
          </strong>

          {description && (
            <div className={styles.description}>
              {description}
            </div>
          )}
        </div>

        <button
          type="button"
          className={styles.closeButton}
          aria-label="Fechar notificação"
          onClick={onClose}
        >
          <X />
        </button>
      </div>
    </div>,
    document.body
  );
}