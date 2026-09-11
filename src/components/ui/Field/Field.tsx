import type { ReactNode } from "react";
import styles from "./Field.module.css";

interface FieldProps {
  id?: string;
  label: string;
  htmlFor?: string;
  required?: boolean;
  hint?: string;
  error?: string;
  highlighted?: boolean;
  children: ReactNode;
  className?: string;
}

export function Field({
  id,
  label,
  htmlFor,
  required = false,
  hint,
  error,
  highlighted = false,
  children,
  className = "",
}: FieldProps) {
  const fieldClassName = [styles.field, highlighted ? styles.highlighted : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div id={id} className={fieldClassName}>
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