"use client";

import type {
  CSSProperties,
  KeyboardEvent,
  ReactNode,
} from "react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { MoreVertical } from "lucide-react";

import styles from "./DropdownMenu.module.css";

export interface DropdownMenuItem {
  value: string;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  danger?: boolean;
  separatorBefore?: boolean;
  onSelect?: () => void;
}

interface DropdownMenuProps {
  items: DropdownMenuItem[];
  label?: string;
  align?: "start" | "end";
  disabled?: boolean;
  className?: string;
}

interface MenuPosition {
  top: number;
  left: number;
}

export function DropdownMenu({
  items,
  label = "Mais ações",
  align = "end",
  disabled = false,
  className = "",
}: DropdownMenuProps) {
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [position, setPosition] =
    useState<MenuPosition | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  function updatePosition() {
    const trigger = triggerRef.current;
    const menu = menuRef.current;

    if (!trigger || !menu) {
      return;
    }

    const triggerRect = trigger.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();

    const margin = 12;
    const spacing = 7;

    let top = triggerRect.bottom + spacing;

    if (
      top + menuRect.height >
      window.innerHeight - margin
    ) {
      top = triggerRect.top - menuRect.height - spacing;
    }

    let left =
      align === "end"
        ? triggerRect.right - menuRect.width
        : triggerRect.left;

    left = Math.max(
      margin,
      Math.min(
        left,
        window.innerWidth - menuRect.width - margin
      )
    );

    top = Math.max(
      margin,
      Math.min(
        top,
        window.innerHeight - menuRect.height - margin
      )
    );

    setPosition({ top, left });
  }

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }

    const animationFrame =
      window.requestAnimationFrame(updatePosition);

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener(
        "scroll",
        updatePosition,
        true
      );
    };
  }, [open, align]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleOutsideClick(event: MouseEvent) {
      const target = event.target as Node;

      if (
        !triggerRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }

    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener(
      "mousedown",
      handleOutsideClick
    );

    document.addEventListener(
      "keydown",
      handleEscape
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handleOutsideClick
      );

      document.removeEventListener(
        "keydown",
        handleEscape
      );
    };
  }, [open]);

  function getEnabledIndexes() {
    return items
      .map((item, index) =>
        item.disabled ? null : index
      )
      .filter(
        (index): index is number => index !== null
      );
  }

  function focusItem(index: number) {
    itemRefs.current[index]?.focus();
  }

  function focusFirstItem() {
    const firstIndex = getEnabledIndexes()[0];

    if (firstIndex !== undefined) {
      window.requestAnimationFrame(() => {
        focusItem(firstIndex);
      });
    }
  }

  function handleTriggerKeyDown(
    event: KeyboardEvent<HTMLButtonElement>
  ) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      focusFirstItem();
    }
  }

  function handleMenuKeyDown(
    event: KeyboardEvent<HTMLDivElement>
  ) {
    const enabledIndexes = getEnabledIndexes();

    if (enabledIndexes.length === 0) {
      return;
    }

    const currentIndex = itemRefs.current.findIndex(
      (item) => item === document.activeElement
    );

    const currentPosition =
      enabledIndexes.indexOf(currentIndex);

    if (event.key === "ArrowDown") {
      event.preventDefault();

      const nextPosition =
        currentPosition < 0
          ? 0
          : (currentPosition + 1) %
            enabledIndexes.length;

      focusItem(enabledIndexes[nextPosition]);
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();

      const previousPosition =
        currentPosition <= 0
          ? enabledIndexes.length - 1
          : currentPosition - 1;

      focusItem(enabledIndexes[previousPosition]);
    }

    if (event.key === "Home") {
      event.preventDefault();
      focusItem(enabledIndexes[0]);
    }

    if (event.key === "End") {
      event.preventDefault();
      focusItem(
        enabledIndexes[enabledIndexes.length - 1]
      );
    }

    if (event.key === "Tab") {
      setOpen(false);
    }
  }

  function selectItem(item: DropdownMenuItem) {
    if (item.disabled) {
      return;
    }

    setOpen(false);
    item.onSelect?.();

    window.requestAnimationFrame(() => {
      triggerRef.current?.focus();
    });
  }

  const menuStyle: CSSProperties = position
    ? {
        top: position.top,
        left: position.left,
      }
    : {
        top: 0,
        left: 0,
        visibility: "hidden",
        pointerEvents: "none",
      };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={[
          styles.trigger,
          open ? styles.triggerOpen : "",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        disabled={disabled}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onKeyDown={handleTriggerKeyDown}
        onClick={() => {
          setOpen((current) => !current);
        }}
      >
        <MoreVertical aria-hidden="true" />
      </button>

      {mounted &&
        open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={label}
            className={styles.menu}
            style={menuStyle}
            onKeyDown={handleMenuKeyDown}
          >
            {items.map((item, index) => (
              <div
                key={item.value}
                className={[
                  styles.itemWrapper,
                  item.separatorBefore
                    ? styles.separator
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <button
                  ref={(element) => {
                    itemRefs.current[index] = element;
                  }}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  className={[
                    styles.item,
                    item.danger ? styles.danger : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => selectItem(item)}
                >
                  {item.icon && (
                    <span
                      className={styles.itemIcon}
                      aria-hidden="true"
                    >
                      {item.icon}
                    </span>
                  )}

                  <span className={styles.itemLabel}>
                    {item.label}
                  </span>
                </button>
              </div>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}