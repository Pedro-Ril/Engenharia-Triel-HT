import type {
  InputHTMLAttributes,
  ReactNode,
} from "react";

import styles from "./Switch.module.css";

interface SwitchProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: ReactNode;
  hint?: string;
  /*
   * Remove o visual de "card" (borda, fundo, padding) — para
   * usar o switch sozinho, sem rótulo, dentro de uma célula de
   * tabela ou cabeçalho compacto.
   */
  compact?: boolean;
}

export function Switch({
  label,
  hint,
  id,
  disabled = false,
  compact = false,
  className = "",
  ...props
}: SwitchProps) {
  const containerClassName = [
    styles.container,
    compact ? styles.compact : "",
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
      {label && (
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
      )}

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