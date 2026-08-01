"use client";

import type { ReactNode } from "react";
import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import styles from "./Modal.module.css";

type ModalSize = "small" | "medium" | "large";

interface ModalProps {
  open: boolean;
  title: string;
  description?: string;
  meta?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: ModalSize;
  closeOnOverlay?: boolean;
  onClose: () => void;
}

export function Modal({
  open,
  title,
  description,
  meta,
  children,
  footer,
  size = "small",
  closeOnOverlay = true,
  onClose,
}: ModalProps) {
  const [mounted, setMounted] = useState(false);

  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!mounted || !open) {
    return null;
  }

  return createPortal(
    <div
      className={styles.overlay}
      onMouseDown={(event) => {
        if (
          closeOnOverlay &&
          event.target === event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <section
        className={`${styles.modal} ${styles[size]}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={
          description ? descriptionId : undefined
        }
      >
        <header className={styles.header}>
          <div className={styles.heading}>
            {meta && (
              <div className={styles.meta}>
                {meta}
              </div>
            )}

            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>

            {description && (
              <p
                id={descriptionId}
                className={styles.description}
              >
                {description}
              </p>
            )}
          </div>

          <button
            type="button"
            className={styles.closeButton}
            aria-label="Fechar modal"
            onClick={onClose}
          >
            <X />
          </button>
        </header>

        <div className={styles.body}>
          {children}
        </div>

        {footer && (
          <footer className={styles.footer}>
            {footer}
          </footer>
        )}
      </section>
    </div>,
    document.body
  );
}