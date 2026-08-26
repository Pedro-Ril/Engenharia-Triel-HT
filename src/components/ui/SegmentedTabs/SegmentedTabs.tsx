"use client";

import type { ReactNode } from "react";

import styles from "./SegmentedTabs.module.css";

export interface SegmentedTabsItem<T extends string> {
  valor: T;
  label: string;
  icon?: ReactNode;
}

interface SegmentedTabsProps<T extends string> {
  itens: SegmentedTabsItem<T>[];
  ativo: T;
  onSelecionar: (valor: T) => void;
  /* Conteúdo extra à direita da última aba (ex: "atualizado há pouco") — mesmo container, empurrado com margin-left:auto. */
  extra?: ReactNode;
  className?: string;
}

export function SegmentedTabs<T extends string>({
  itens,
  ativo,
  onSelecionar,
  extra,
  className = "",
}: SegmentedTabsProps<T>) {
  return (
    <div className={[styles.abas, className].filter(Boolean).join(" ")}>
      {itens.map((item) => (
        <button
          key={item.valor}
          type="button"
          className={`${styles.abaBtn} ${ativo === item.valor ? styles.abaBtnAtiva : ""}`}
          onClick={() => onSelecionar(item.valor)}
        >
          {item.icon}
          {item.label}
        </button>
      ))}

      {extra}
    </div>
  );
}
