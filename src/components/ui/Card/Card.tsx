import type { ReactNode } from "react";
import styles from "./Card.module.css";

interface CardProps {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  allowOverflow?: boolean;
}

export function Card({
  title,
  description,
  actions,
  children,
  className = "",
  allowOverflow = false,
}: CardProps) {
  const cardClassName = [
    styles.card,
    allowOverflow ? styles.allowOverflow : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const hasHeader = title || description || actions;

  return (
    <section className={cardClassName}>
      {hasHeader && (
        <header className={styles.header}>
          <div className={styles.heading}>
            {title && <h2 className={styles.title}>{title}</h2>}

            {description && (
              <p className={styles.description}>{description}</p>
            )}
          </div>

          {actions && (
            <div className={styles.actions}>{actions}</div>
          )}
        </header>
      )}

      <div className={styles.content}>{children}</div>
    </section>
  );
}