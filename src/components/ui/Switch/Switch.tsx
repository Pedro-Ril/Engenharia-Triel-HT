import type {
  InputHTMLAttributes,
  ReactNode,
} from "react";

import styles from "./Switch.module.css";

interface SwitchProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: ReactNode;
  hint?: string;
}

export function Switch({
  label,
  hint,
  id,
  disabled = false,
  className = "",
  ...props
}: SwitchProps) {
  const containerClassName = [
    styles.container,
    disabled ? styles.disabled : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <label
      htmlFor={id}
      className={containerClassName}
    >
      <span className={styles.content}>
        <span className={styles.label}>
          {label}
        </span>

        {hint && (
          <span className={styles.hint}>
            {hint}
          </span>
        )}
      </span>

      <span className={styles.switchWrapper}>
        <input
          {...props}
          id={id}
          type="checkbox"
          role="switch"
          disabled={disabled}
          className={styles.input}
        />

        <span
          className={styles.control}
          aria-hidden="true"
        >
          <span className={styles.thumb} />
        </span>
      </span>
    </label>
  );
}