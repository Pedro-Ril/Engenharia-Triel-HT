import type { ReactNode } from "react";
import styles from "./EmptyState.module.css";

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  className = "",
}: EmptyStateProps) {
  const emptyStateClassName = [
    styles.container,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={emptyStateClassName}>
      {icon && (
        <div className={styles.icon} aria-hidden="true">
          {icon}
        </div>
      )}

      <div className={styles.content}>
        <h3 className={styles.title}>{title}</h3>

        {description && (
          <p className={styles.description}>
            {description}
          </p>
        )}
      </div>

      {action && (
        <div className={styles.action}>
          {action}
        </div>
      )}
    </div>
  );
}