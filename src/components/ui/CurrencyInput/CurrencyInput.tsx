"use client";

import type { ChangeEvent } from "react";

import styles from "./CurrencyInput.module.css";

interface CurrencyInputProps {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  hasError?: boolean;
  className?: string;
  id?: string;
}

/*
 * Exibe em Real (ex: "1.234,56") mas reporta um número puro com ponto
 * decimal (ex: "1234.56") via onValueChange — mesmo formato que o campo
 * já usava antes da máscara, então quem consome o valor (formData,
 * Number(), optionalDecimal no servidor) não precisa mudar nada.
 */
function formatarExibicao(valor: string): string {
  if (!valor) return "";

  const centavos = Math.round(Number(valor) * 100);
  if (!Number.isFinite(centavos)) return "";

  return (centavos / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function CurrencyInput({
  value,
  onValueChange,
  disabled = false,
  hasError = false,
  className = "",
  id,
}: CurrencyInputProps) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const digitos = event.target.value.replace(/\D/g, "").slice(0, 13);
    onValueChange(digitos ? (Number(digitos) / 100).toFixed(2) : "");
  }

  const containerClassName = [
    styles.container,
    hasError ? styles.error : "",
    disabled ? styles.disabled : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={containerClassName}>
      <span className={styles.affix} aria-hidden="true">
        R$
      </span>

      <input
        id={id}
        type="text"
        inputMode="numeric"
        className={styles.input}
        value={formatarExibicao(value)}
        onChange={handleChange}
        disabled={disabled}
        placeholder="0,00"
        aria-invalid={hasError || undefined}
      />
    </div>
  );
}
