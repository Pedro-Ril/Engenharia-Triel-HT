import type { InputHTMLAttributes, ReactNode } from "react";
import styles from "./Checkbox.module.css";

interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: ReactNode;
  hint?: string;
}

export function Checkbox({
  label,
  hint,
  className = "",
  id,
  disabled,
  ...props
}: CheckboxProps) {
  const containerClassName = [
    styles.container,
    disabled ? styles.disabled : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={containerClassName}>
      <label className={styles.label} htmlFor={id}>
        <input
          {...props}
          id={id}
          type="checkbox"
          disabled={disabled}
          className={styles.input}
        />

        <span className={styles.control} aria-hidden="true">
          <svg
            viewBox="0 0 12 10"
            className={styles.icon}
          >
            <path d="M1 5.2 4.2 8.4 11 1.4" />
          </svg>
        </span>

        <span className={styles.content}>
          <span className={styles.labelText}>{label}</span>

          {hint && (
            <span className={styles.hint}>{hint}</span>
          )}
        </span>
      </label>
    </div>
  );
}