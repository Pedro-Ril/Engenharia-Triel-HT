import type { HTMLAttributes, ReactNode } from "react";
import styles from "./Badge.module.css";

type BadgeVariant =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "primary";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  variant?: BadgeVariant;
}

export function Badge({
  children,
  variant = "neutral",
  className = "",
  ...props
}: BadgeProps) {
  const badgeClassName = [
    styles.badge,
    styles[variant],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={badgeClassName} {...props}>
      {children}
    </span>
  );
}