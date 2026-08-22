"use client";

import type { ReactNode } from "react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

import styles from "./Dropdown.module.css";

export interface DropdownOption {
  value: string;
  label: ReactNode;
}

interface DropdownProps {
  value: string;
  options: DropdownOption[];
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  hasError?: boolean;
  className?: string;
}

interface PosicaoDropdown {
  top: number;
  left: number;
  width: number;
}

/*
 * `<select>` nativo não permite estilizar a lista aberta (o
 * navegador renderiza o popup fora do controle do CSS) — este
 * componente resolve isso com um popover próprio, seguindo o
 * mesmo visual do DropdownMenu (menu flutuante com sombra)
 * combinado com a caixa do Select (borda arredondada, seta) para
 * o gatilho. É o dropdown padrão do portal para "escolher um
 * valor entre opções" — o Select nativo continua existindo só
 * para casos que precisem do comportamento realmente nativo.
 */
export function Dropdown({
  value,
  options,
  onValueChange,
  placeholder = "Selecione",
  disabled = false,
  hasError = false,
  className = "",
}: DropdownProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [posicao, setPosicao] = useState<PosicaoDropdown | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPosicao(null);
      return;
    }

    function atualizarPosicao() {
      const trigger = triggerRef.current;
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      setPosicao({ top: rect.bottom + 6, left: rect.left, width: rect.width });
    }

    const frame = window.requestAnimationFrame(atualizarPosicao);
    window.addEventListener("resize", atualizarPosicao);
    window.addEventListener("scroll", atualizarPosicao, true);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", atualizarPosicao);
      window.removeEventListener("scroll", atualizarPosicao, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handleClickFora(event: MouseEvent) {
      const alvo = event.target as Node;
      if (!triggerRef.current?.contains(alvo) && !menuRef.current?.contains(alvo)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", handleClickFora);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickFora);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const selecionado = options.find((option) => option.value === value);

  const triggerClassName = [
    styles.trigger,
    hasError ? styles.error : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={styles.wrapper}>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((atual) => !atual)}
      >
        <span className={selecionado ? styles.valor : styles.placeholder}>
          {selecionado ? selecionado.label : placeholder}
        </span>

        <ChevronDown
          size={16}
          className={styles.chevron}
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        />
      </button>

      {mounted &&
        open &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            className={styles.menu}
            style={
              posicao
                ? { top: posicao.top, left: posicao.left, width: posicao.width }
                : { visibility: "hidden" }
            }
          >
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === value}
                className={styles.item}
                onClick={() => {
                  onValueChange(option.value);
                  setOpen(false);
                }}
              >
                <span>{option.label}</span>
                {option.value === value && <Check size={15} aria-hidden="true" />}
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}
