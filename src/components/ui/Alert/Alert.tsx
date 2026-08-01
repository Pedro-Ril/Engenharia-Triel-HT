import type { HTMLAttributes, ReactNode } from "react";
import styles from "./Alert.module.css";

type AlertVariant =
  | "info"
  | "success"
  | "warning"
  | "danger";

interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  title?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  variant?: AlertVariant;
}

export function Alert({
  children,
  title,
  icon,
  actions,
  variant = "info",
  className = "",
  ...props
}: AlertProps) {
  const alertClassName = [
    styles.alert,
    styles[variant],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={alertClassName}
      role={variant === "danger" ? "alert" : "status"}
      {...props}
    >
      {icon && (
        <div className={styles.icon} aria-hidden="true">
          {icon}
        </div>
      )}

      <div className={styles.content}>
        {title && (
          <strong className={styles.title}>
            {title}
          </strong>
        )}

        <div className={styles.message}>
          {children}
        </div>
      </div>

      {actions && (
        <div className={styles.actions}>
          {actions}
        </div>
      )}
    </div>
  );
}