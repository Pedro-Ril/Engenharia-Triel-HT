import type { TextareaHTMLAttributes } from "react";
import styles from "./Textarea.module.css";

interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  hasError?: boolean;
}

export function Textarea({
  hasError = false,
  className = "",
  ...props
}: TextareaProps) {
  const textareaClassName = [
    styles.textarea,
    hasError ? styles.error : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <textarea
      className={textareaClassName}
      aria-invalid={hasError || undefined}
      {...props}
    />
  );
}