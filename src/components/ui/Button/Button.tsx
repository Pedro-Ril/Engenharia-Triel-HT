import type {
  ButtonHTMLAttributes,
  ReactNode,
} from "react";

import { Loader } from "@/components/ui/Loader";

import styles from "./Button.module.css";

type ButtonVariant =
  | "primary"
  | "secondary"
  | "danger";

interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: ButtonVariant;
  loading?: boolean;
  loadingLabel?: ReactNode;
  fullWidth?: boolean;
}

export function Button({
  children,
  variant = "primary",
  loading = false,
  loadingLabel = "Carregando...",
  fullWidth = false,
  className = "",
  type = "button",
  disabled,
  ...props
}: ButtonProps) {
  const buttonClassName = [
    styles.button,
    styles[variant],
    loading ? styles.loading : "",
    fullWidth ? styles.fullWidth : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type={type}
      className={buttonClassName}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <span className={styles.loadingContent}>
          <Loader
            size="small"
            label=""
            className={styles.loader}
          />

          <span>{loadingLabel}</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
}