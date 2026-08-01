import type {
  InputHTMLAttributes,
  ReactNode,
} from "react";

import styles from "./NumberInput.module.css";

interface NumberInputProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    "type" | "prefix"
  > {
  prefix?: ReactNode;
  suffix?: ReactNode;
  hasError?: boolean;
}

export function NumberInput({
  prefix,
  suffix,
  hasError = false,
  className = "",
  disabled,
  ...props
}: NumberInputProps) {
  const containerClassName = [
    styles.container,
    hasError ? styles.error : "",
    disabled ? styles.disabled : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={containerClassName}>
      {prefix && (
        <span
          className={styles.affix}
          aria-hidden="true"
        >
          {prefix}
        </span>
      )}

      <input
        {...props}
        type="number"
        disabled={disabled}
        className={styles.input}
        aria-invalid={hasError || undefined}
      />

      {suffix && (
        <span
          className={styles.affix}
          aria-hidden="true"
        >
          {suffix}
        </span>
      )}
    </div>
  );
}