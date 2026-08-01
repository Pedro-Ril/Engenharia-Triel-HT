import type {
  ButtonHTMLAttributes,
  ReactNode,
} from "react";

import { Loader } from "@/components/ui/Loader";

import styles from "./IconButton.module.css";

type IconButtonVariant =
  | "neutral"
  | "primary"
  | "danger";

type IconButtonSize =
  | "small"
  | "medium"
  | "large";

interface IconButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  label: string;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  loading?: boolean;
}

export function IconButton({
  icon,
  label,
  variant = "neutral",
  size = "medium",
  loading = false,
  className = "",
  type = "button",
  disabled,
  ...props
}: IconButtonProps) {
  const buttonClassName = [
    styles.button,
    styles[variant],
    styles[size],
    loading ? styles.loading : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type={type}
      className={buttonClassName}
      disabled={disabled || loading}
      aria-label={label}
      title={label}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <Loader
          size="small"
          label=""
          className={styles.loader}
        />
      ) : (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      )}
    </button>
  );
}