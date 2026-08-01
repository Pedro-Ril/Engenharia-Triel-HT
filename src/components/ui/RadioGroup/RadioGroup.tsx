"use client";

import type { ReactNode } from "react";
import { useId } from "react";

import styles from "./RadioGroup.module.css";

export interface RadioOption {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

interface RadioGroupProps {
  name: string;
  options: RadioOption[];
  label?: ReactNode;
  value?: string;
  defaultValue?: string;
  orientation?: "vertical" | "horizontal";
  disabled?: boolean;
  required?: boolean;
  hasError?: boolean;
  onValueChange?: (value: string) => void;
  className?: string;
}

export function RadioGroup({
  name,
  options,
  label,
  value,
  defaultValue,
  orientation = "vertical",
  disabled = false,
  required = false,
  hasError = false,
  onValueChange,
  className = "",
}: RadioGroupProps) {
  const generatedId = useId().replaceAll(":", "");
  const isControlled = value !== undefined;

  const fieldsetClassName = [
    styles.fieldset,
    hasError ? styles.error : "",
    disabled ? styles.disabled : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <fieldset
      className={fieldsetClassName}
      disabled={disabled}
      aria-invalid={hasError || undefined}
    >
      {label && (
        <legend className={styles.legend}>
          {label}

          {required && (
            <span className={styles.required} aria-hidden="true">
              *
            </span>
          )}
        </legend>
      )}

      <div
        className={[
          styles.options,
          styles[orientation],
        ].join(" ")}
      >
        {options.map((option, index) => {
          const inputId = `${generatedId}-${index}`;
          const optionDisabled = disabled || option.disabled;

          return (
            <label
              key={option.value}
              htmlFor={inputId}
              className={styles.option}
            >
              <input
                id={inputId}
                type="radio"
                name={name}
                value={option.value}
                disabled={optionDisabled}
                required={required}
                className={styles.input}
                checked={
                  isControlled
                    ? value === option.value
                    : undefined
                }
                defaultChecked={
                  !isControlled
                    ? defaultValue === option.value
                    : undefined
                }
                onChange={(event) => {
                  if (event.target.checked) {
                    onValueChange?.(option.value);
                  }
                }}
              />

              <span
                className={styles.indicator}
                aria-hidden="true"
              >
                <span className={styles.dot} />
              </span>

              {option.icon && (
                <span
                  className={styles.icon}
                  aria-hidden="true"
                >
                  {option.icon}
                </span>
              )}

              <span className={styles.content}>
                <span className={styles.optionLabel}>
                  {option.label}
                </span>

                {option.description && (
                  <span className={styles.description}>
                    {option.description}
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}