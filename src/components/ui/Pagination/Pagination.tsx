"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import styles from "./Pagination.module.css";

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  siblingCount?: number;
  disabled?: boolean;
  className?: string;
}

type PaginationItem = number | "ellipsis-left" | "ellipsis-right";

function createPaginationItems(
  page: number,
  totalPages: number,
  siblingCount: number
): PaginationItem[] {
  if (totalPages <= 1) {
    return [1];
  }

  const visiblePages = siblingCount * 2 + 5;

  if (totalPages <= visiblePages) {
    return Array.from(
      { length: totalPages },
      (_, index) => index + 1
    );
  }

  const leftSibling = Math.max(page - siblingCount, 2);
  const rightSibling = Math.min(
    page + siblingCount,
    totalPages - 1
  );

  const showLeftEllipsis = leftSibling > 2;
  const showRightEllipsis = rightSibling < totalPages - 1;

  const items: PaginationItem[] = [1];

  if (showLeftEllipsis) {
    items.push("ellipsis-left");
  }

  for (
    let currentPage = leftSibling;
    currentPage <= rightSibling;
    currentPage += 1
  ) {
    items.push(currentPage);
  }

  if (showRightEllipsis) {
    items.push("ellipsis-right");
  }

  items.push(totalPages);

  return items;
}

export function Pagination({
  page,
  totalPages,
  onPageChange,
  siblingCount = 1,
  disabled = false,
  className = "",
}: PaginationProps) {
  if (totalPages <= 1) {
    return null;
  }

  const safePage = Math.min(
    Math.max(page, 1),
    totalPages
  );

  const items = createPaginationItems(
    safePage,
    totalPages,
    siblingCount
  );

  function changePage(nextPage: number) {
    if (disabled) return;
    if (nextPage < 1 || nextPage > totalPages) return;
    if (nextPage === safePage) return;

    onPageChange(nextPage);
  }

  return (
    <nav
      className={[styles.pagination, className]
        .filter(Boolean)
        .join(" ")}
      aria-label="Paginação"
    >
      <button
        type="button"
        className={styles.navigationButton}
        disabled={disabled || safePage === 1}
        aria-label="Página anterior"
        onClick={() => changePage(safePage - 1)}
      >
        <ChevronLeft />
      </button>

      <div className={styles.pages}>
        {items.map((item) => {
          if (typeof item !== "number") {
            return (
              <span
                key={item}
                className={styles.ellipsis}
                aria-hidden="true"
              >
                …
              </span>
            );
          }

          const active = item === safePage;

          return (
            <button
              key={item}
              type="button"
              className={[
                styles.pageButton,
                active ? styles.active : "",
              ]
                .filter(Boolean)
                .join(" ")}
              disabled={disabled}
              aria-label={`Ir para a página ${item}`}
              aria-current={active ? "page" : undefined}
              onClick={() => changePage(item)}
            >
              {item}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className={styles.navigationButton}
        disabled={disabled || safePage === totalPages}
        aria-label="Próxima página"
        onClick={() => changePage(safePage + 1)}
      >
        <ChevronRight />
      </button>
    </nav>
  );
}