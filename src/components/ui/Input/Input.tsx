import type { InputHTMLAttributes } from "react";
import styles from "./Input.module.css";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean;
}

export function Input({
  hasError = false,
  className = "",
  ...props
}: InputProps) {
  const inputClassName = [
    styles.input,
    hasError ? styles.error : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <input className={inputClassName} {...props} />;
}