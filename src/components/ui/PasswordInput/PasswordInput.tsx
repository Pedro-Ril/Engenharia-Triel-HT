"use client";

import { useState } from "react";
import type { ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";

import { Input } from "../Input";
import styles from "./PasswordInput.module.css";

type PasswordInputProps = Omit<ComponentProps<typeof Input>, "type">;

/*
 * Campo de senha com o "olhinho" para mostrar/ocultar o que foi
 * digitado. Cada campo guarda o próprio estado (dois campos de senha
 * na mesma tela abrem e fecham independentes) e sempre começa oculto.
 */
export function PasswordInput({ className = "", disabled, ...props }: PasswordInputProps) {
  const [visivel, setVisivel] = useState(false);

  return (
    <div className={styles.wrapper}>
      <Input
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        {...props}
        disabled={disabled}
        type={visivel ? "text" : "password"}
        className={[styles.input, className].filter(Boolean).join(" ")}
      />

      <button
        type="button"
        className={styles.alternar}
        onClick={() => setVisivel((atual) => !atual)}
        disabled={disabled}
        aria-label={visivel ? "Ocultar senha" : "Mostrar senha"}
        aria-pressed={visivel}
        title={visivel ? "Ocultar senha" : "Mostrar senha"}
      >
        {visivel ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
      </button>
    </div>
  );
}
