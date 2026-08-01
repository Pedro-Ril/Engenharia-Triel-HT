"use client";

import type { ReactNode } from "react";

import styles from "./Tabs.module.css";

export interface TabItem {
  value: string;
  label: ReactNode;
  content: ReactNode;
  disabled?: boolean;
}

interface TabsProps {
  items: TabItem[];
  value: string;
  onValueChange: (value: string) => void;
  ariaLabel?: string;
  className?: string;
}

export function Tabs({
  items,
  value,
  onValueChange,
  ariaLabel = "Navegação por abas",
  className = "",
}: TabsProps) {
  const tabsClassName = [styles.tabs, className]
    .filter(Boolean)
    .join(" ");

  const activeItem = items.find((item) => item.value === value);

  function handleKeyDown(
    event: React.KeyboardEvent<HTMLButtonElement>,
    currentIndex: number
  ) {
    const enabledItems = items
      .map((item, index) => ({
        ...item,
        originalIndex: index,
      }))
      .filter((item) => !item.disabled);

    const enabledIndex = enabledItems.findIndex(
      (item) => item.originalIndex === currentIndex
    );

    if (enabledIndex < 0) return;

    let nextIndex = enabledIndex;

    if (event.key === "ArrowRight") {
      nextIndex = (enabledIndex + 1) % enabledItems.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex =
        (enabledIndex - 1 + enabledItems.length) %
        enabledItems.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = enabledItems.length - 1;
    } else {
      return;
    }

    event.preventDefault();

    const nextItem = enabledItems[nextIndex];

    onValueChange(nextItem.value);

    requestAnimationFrame(() => {
      document
        .getElementById(`tab-${nextItem.value}`)
        ?.focus();
    });
  }

  return (
    <div className={tabsClassName}>
      <div
        className={styles.list}
        role="tablist"
        aria-label={ariaLabel}
      >
        {items.map((item, index) => {
          const active = item.value === value;

          return (
            <button
              key={item.value}
              id={`tab-${item.value}`}
              type="button"
              role="tab"
              disabled={item.disabled}
              aria-selected={active}
              aria-controls={`panel-${item.value}`}
              tabIndex={active ? 0 : -1}
              className={[
                styles.trigger,
                active ? styles.active : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => onValueChange(item.value)}
              onKeyDown={(event) =>
                handleKeyDown(event, index)
              }
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {activeItem && (
        <div
          id={`panel-${activeItem.value}`}
          role="tabpanel"
          aria-labelledby={`tab-${activeItem.value}`}
          className={styles.content}
        >
          {activeItem.content}
        </div>
      )}
    </div>
  );
}