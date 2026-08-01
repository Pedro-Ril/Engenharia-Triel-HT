import type { SelectHTMLAttributes } from "react";
import styles from "./Select.module.css";

interface SelectProps
  extends SelectHTMLAttributes<HTMLSelectElement> {
  hasError?: boolean;
}

export function Select({
  hasError = false,
  className = "",
  children,
  ...props
}: SelectProps) {
  const selectClassName = [
    styles.select,
    hasError ? styles.error : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <select className={selectClassName} {...props}>
      {children}
    </select>
  );
}