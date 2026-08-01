import type { ReactNode } from "react";

import styles from "./StatCard.module.css";

type StatCardVariant =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger";

interface StatCardProps {
  label: string;
  value: ReactNode;
  description?: string;
  icon?: ReactNode;
  variant?: StatCardVariant;
  className?: string;
}

export function StatCard({
  label,
  value,
  description,
  icon,
  variant = "neutral",
  className = "",
}: StatCardProps) {
  const cardClassName = [
    styles.card,
    styles[variant],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article className={cardClassName}>
      <div className={styles.header}>
        <span className={styles.label}>
          {label}
        </span>

        {icon && (
          <span
            className={styles.icon}
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
      </div>

      <strong className={styles.value}>
        {value}
      </strong>

      {description && (
        <p className={styles.description}>
          {description}
        </p>
      )}
    </article>
  );
}