import type { ReactNode } from "react";
import styles from "./Field.module.css";

interface FieldProps {
  label: string;
  htmlFor?: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}

export function Field({
  label,
  htmlFor,
  required = false,
  hint,
  error,
  children,
  className = "",
}: FieldProps) {
  const fieldClassName = [styles.field, className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={fieldClassName}>
      <label htmlFor={htmlFor} className={styles.label}>
        {label}

        {required && (
          <span className={styles.required} aria-hidden="true">
            *
          </span>
        )}
      </label>

      {children}

      {error ? (
        <span className={styles.error} role="alert">
          {error}
        </span>
      ) : (
        hint && <span className={styles.hint}>{hint}</span>
      )}
    </div>
  );
}