"use client";

import type {
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from "react";
import {
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import styles from "./Drawer.module.css";

type DrawerSide = "left" | "right";
type DrawerSize = "small" | "medium" | "large";

interface DrawerProps {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  side?: DrawerSide;
  size?: DrawerSize;
  closeOnOverlayClick?: boolean;
  className?: string;
  onClose: () => void;
}

const DRAWER_CLOSE_DURATION = 360;

const focusableSelector = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function Drawer({
  open,
  title,
  description,
  children,
  footer,
  side = "right",
  size = "medium",
  closeOnOverlayClick = true,
  className = "",
  onClose,
}: DrawerProps) {
  const titleId = useId();
  const descriptionId = useId();

  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef =
    useRef<HTMLButtonElement>(null);

  const onCloseRef = useRef(onClose);

  const [mounted, setMounted] = useState(false);
  const [rendered, setRendered] = useState(open);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    setMounted(true);
  }, []);

  /*
   * Mantém o Drawer renderizado durante a animação
   * de fechamento.
   */
  useEffect(() => {
    if (open) {
      setRendered(true);
      setClosing(false);
      return;
    }

    if (!rendered) {
      return;
    }

    setClosing(true);

    const prefersReducedMotion =
      window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;

    const duration = prefersReducedMotion
      ? 0
      : DRAWER_CLOSE_DURATION;

    const timeout = window.setTimeout(() => {
      setRendered(false);
      setClosing(false);
    }, duration);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [open, rendered]);

  /*
   * Controla foco, teclado e bloqueio da rolagem
   * enquanto o Drawer estiver renderizado.
   */
  useEffect(() => {
    if (!rendered) {
      return;
    }

    const previousActiveElement =
      document.activeElement as HTMLElement | null;

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow = "hidden";

    const animationFrame =
      window.requestAnimationFrame(() => {
        closeButtonRef.current?.focus();
      });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (
        event.key !== "Tab" ||
        !panelRef.current
      ) {
        return;
      }

      const focusableElements = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          focusableSelector
        )
      );

      if (focusableElements.length === 0) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }

      const firstElement = focusableElements[0];

      const lastElement =
        focusableElements[
          focusableElements.length - 1
        ];

      if (
        event.shiftKey &&
        document.activeElement === firstElement
      ) {
        event.preventDefault();
        lastElement.focus();
        return;
      }

      if (
        !event.shiftKey &&
        document.activeElement === lastElement
      ) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    document.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      window.cancelAnimationFrame(animationFrame);

      document.removeEventListener(
        "keydown",
        handleKeyDown
      );

      document.body.style.overflow =
        previousOverflow;

      previousActiveElement?.focus();
    };
  }, [rendered]);

  function requestClose() {
    if (closing) {
      return;
    }

    onCloseRef.current();
  }

  function handleOverlayClick(
    event: ReactMouseEvent<HTMLDivElement>
  ) {
    if (
      closing ||
      !closeOnOverlayClick ||
      event.target !== event.currentTarget
    ) {
      return;
    }

    requestClose();
  }

  if (!mounted || !rendered) {
    return null;
  }

  const overlayClassName = [
    styles.overlay,
    closing ? styles.overlayClosing : "",
  ]
    .filter(Boolean)
    .join(" ");

  const drawerClassName = [
    styles.drawer,
    styles[side],
    styles[size],
    closing ? styles.drawerClosing : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return createPortal(
    <div
      className={overlayClassName}
      onMouseDown={handleOverlayClick}
    >
      <div
        ref={panelRef}
        className={drawerClassName}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={
          description
            ? descriptionId
            : undefined
        }
        tabIndex={-1}
      >
        <header className={styles.header}>
          <div className={styles.heading}>
            <h2
              id={titleId}
              className={styles.title}
            >
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
            ref={closeButtonRef}
            type="button"
            className={styles.closeButton}
            aria-label="Fechar painel"
            onClick={requestClose}
          >
            <X aria-hidden="true" />
          </button>
        </header>

        <div className={styles.content}>
          {children}
        </div>

        {footer && (
          <footer className={styles.footer}>
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body
  );
}