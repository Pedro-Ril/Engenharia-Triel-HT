"use client";

import type { ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import styles from "./Modal.module.css";

const SELETOR_FOCAVEL =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
  const dialogRef = useRef<HTMLElement>(null);
  const elementoAnteriorRef = useRef<HTMLElement | null>(null);

  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    /*
     * Sem isso, o teclado continua no elemento que abriu o
     * modal (geralmente atrás dele, visualmente encoberto) em
     * vez de entrar no diálogo — e nunca volta pra lá ao fechar.
     */
    elementoAnteriorRef.current = document.activeElement as HTMLElement | null;

    const primeiroFoco =
      dialogRef.current?.querySelector<HTMLElement>(SELETOR_FOCAVEL) ??
      dialogRef.current;
    primeiroFoco?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;

      const focaveis = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(SELETOR_FOCAVEL)
      );
      if (focaveis.length === 0) return;

      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];

      if (event.shiftKey && document.activeElement === primeiro) {
        event.preventDefault();
        ultimo.focus();
      } else if (!event.shiftKey && document.activeElement === ultimo) {
        event.preventDefault();
        primeiro.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      elementoAnteriorRef.current?.focus();
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
        ref={dialogRef}
        className={`${styles.modal} ${styles[size]}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={
          description ? descriptionId : undefined
        }
        tabIndex={-1}
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