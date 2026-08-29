import type { InputHTMLAttributes, Ref } from "react";
import styles from "./Input.module.css";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean;
  ref?: Ref<HTMLInputElement>;
}

export function Input({
  hasError = false,
  className = "",
  ref,
  ...props
}: InputProps) {
  const inputClassName = [
    styles.input,
    hasError ? styles.error : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <input ref={ref} className={inputClassName} {...props} />;
}