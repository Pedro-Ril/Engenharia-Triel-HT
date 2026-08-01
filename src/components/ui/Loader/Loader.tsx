import type { HTMLAttributes } from "react";

import styles from "./Loader.module.css";

type LoaderSize = "small" | "medium" | "large";

interface LoaderProps extends HTMLAttributes<HTMLDivElement> {
  label?: string;
  size?: LoaderSize;
  centered?: boolean;
}

export function Loader({
  label = "Carregando...",
  size = "medium",
  centered = false,
  className = "",
  ...props
}: LoaderProps) {
  const loaderClassName = [
    styles.loader,
    centered ? styles.centered : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={loaderClassName}
      role="status"
      aria-live="polite"
      {...props}
    >
      <span
        className={`${styles.track} ${styles[size]}`}
        aria-hidden="true"
      >
        <span className={styles.progress} />
      </span>

      {label && (
        <span className={styles.label}>
          {label}
        </span>
      )}
    </div>
  );
}