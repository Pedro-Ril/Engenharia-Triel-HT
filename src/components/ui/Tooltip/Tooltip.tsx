"use client";

import type {
  ReactElement,
  ReactNode,
} from "react";
import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import styles from "./Tooltip.module.css";

type TooltipPlacement =
  | "top"
  | "bottom"
  | "left"
  | "right";

interface TooltipChildProps {
  title?: string;
  "aria-describedby"?: string;
}

interface TooltipProps {
  children: ReactElement<TooltipChildProps>;
  content: ReactNode;
  placement?: TooltipPlacement;
  delay?: number;
  disabled?: boolean;
}

interface TooltipPosition {
  top: number;
  left: number;
}

export function Tooltip({
  children,
  content,
  placement = "top",
  delay = 250,
  disabled = false,
}: TooltipProps) {
  const tooltipId = useId();

  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [position, setPosition] =
    useState<TooltipPosition>({
      top: 0,
      left: 0,
    });

  useEffect(() => {
    setMounted(true);
  }, []);

  const clearTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const showTooltip = useCallback(() => {
    if (disabled) return;

    clearTimer();

    timeoutRef.current = setTimeout(() => {
      setOpen(true);
    }, delay);
  }, [clearTimer, delay, disabled]);

  const hideTooltip = useCallback(() => {
    clearTimer();
    setOpen(false);
  }, [clearTimer]);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    const tooltip = tooltipRef.current;

    if (!trigger || !tooltip) return;

    const triggerRect = trigger.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();

    const gap = 10;
    const viewportMargin = 8;

    let top = 0;
    let left = 0;

    switch (placement) {
      case "bottom":
        top = triggerRect.bottom + gap;
        left =
          triggerRect.left +
          triggerRect.width / 2 -
          tooltipRect.width / 2;
        break;

      case "left":
        top =
          triggerRect.top +
          triggerRect.height / 2 -
          tooltipRect.height / 2;
        left = triggerRect.left - tooltipRect.width - gap;
        break;

      case "right":
        top =
          triggerRect.top +
          triggerRect.height / 2 -
          tooltipRect.height / 2;
        left = triggerRect.right + gap;
        break;

      case "top":
      default:
        top = triggerRect.top - tooltipRect.height - gap;
        left =
          triggerRect.left +
          triggerRect.width / 2 -
          tooltipRect.width / 2;
        break;
    }

    const maximumLeft =
      window.innerWidth -
      tooltipRect.width -
      viewportMargin;

    const maximumTop =
      window.innerHeight -
      tooltipRect.height -
      viewportMargin;

    setPosition({
      left: Math.max(
        viewportMargin,
        Math.min(left, maximumLeft)
      ),
      top: Math.max(
        viewportMargin,
        Math.min(top, maximumTop)
      ),
    });
  }, [placement]);

  useLayoutEffect(() => {
    if (!open) return;

    updatePosition();
  }, [open, content, updatePosition]);

  useEffect(() => {
    if (!open) return;

    function handleViewportChange() {
      updatePosition();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        hideTooltip();
      }
    }

    window.addEventListener(
      "resize",
      handleViewportChange
    );

    window.addEventListener(
      "scroll",
      handleViewportChange,
      true
    );

    document.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      window.removeEventListener(
        "resize",
        handleViewportChange
      );

      window.removeEventListener(
        "scroll",
        handleViewportChange,
        true
      );

      document.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [hideTooltip, open, updatePosition]);

  useEffect(() => {
    return clearTimer;
  }, [clearTimer]);

  const trigger = cloneElement(children, {
    title: undefined,
    "aria-describedby": open
      ? tooltipId
      : children.props["aria-describedby"],
  });

  return (
    <>
      <span
        ref={triggerRef}
        className={styles.trigger}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocusCapture={showTooltip}
        onBlurCapture={hideTooltip}
      >
        {trigger}
      </span>

      {mounted &&
        open &&
        !disabled &&
        createPortal(
          <div
            ref={tooltipRef}
            id={tooltipId}
            role="tooltip"
            data-placement={placement}
            className={styles.tooltip}
            style={{
              top: position.top,
              left: position.left,
            }}
          >
            {content}
          </div>,
          document.body
        )}
    </>
  );
}