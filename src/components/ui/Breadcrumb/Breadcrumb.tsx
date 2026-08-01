import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import styles from "./Breadcrumb.module.css";

export interface BreadcrumbItem {
  label: ReactNode;
  href?: string;
  icon?: ReactNode;
  current?: boolean;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  ariaLabel?: string;
  className?: string;
}

export function Breadcrumb({
  items,
  ariaLabel = "Navegação estrutural",
  className = "",
}: BreadcrumbProps) {
  const breadcrumbClassName = [
    styles.breadcrumb,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <nav
      className={breadcrumbClassName}
      aria-label={ariaLabel}
    >
      <ol className={styles.list}>
        {items.map((item, index) => {
          const isLastItem = index === items.length - 1;
          const isCurrent = item.current ?? isLastItem;

          return (
            <li
              key={`${String(item.label)}-${index}`}
              className={styles.item}
            >
              {index > 0 && (
                <ChevronRight
                  className={styles.separator}
                  aria-hidden="true"
                />
              )}

              {item.href && !isCurrent ? (
                <Link
                  href={item.href}
                  className={styles.link}
                >
                  {item.icon && (
                    <span
                      className={styles.icon}
                      aria-hidden="true"
                    >
                      {item.icon}
                    </span>
                  )}

                  <span className={styles.label}>
                    {item.label}
                  </span>
                </Link>
              ) : (
                <span
                  className={[
                    styles.text,
                    isCurrent ? styles.current : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-current={
                    isCurrent ? "page" : undefined
                  }
                >
                  {item.icon && (
                    <span
                      className={styles.icon}
                      aria-hidden="true"
                    >
                      {item.icon}
                    </span>
                  )}

                  <span className={styles.label}>
                    {item.label}
                  </span>
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}