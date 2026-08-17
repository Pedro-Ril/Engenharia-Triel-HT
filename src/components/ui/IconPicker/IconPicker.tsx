"use client";

import { createElement, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";

import { ICONES_PORTAL, resolverIcone } from "@/lib/icons/icon-registry";

import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";

import styles from "./IconPicker.module.css";

interface IconPickerProps {
  value: string | null;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function IconPicker({ value, onChange, disabled = false }: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState("");

  const iconesFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    if (!termo) {
      return ICONES_PORTAL;
    }

    return ICONES_PORTAL.filter((item) =>
      item.nome.toLowerCase().includes(termo)
    );
  }, [busca]);

  function selecionar(nome: string) {
    onChange(nome);
    setOpen(false);
    setBusca("");
  }

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen(true)}
        disabled={disabled}
      >
        <span className={styles.triggerIcon}>
          {createElement(resolverIcone(value), { size: 18 })}
        </span>

        <span className={styles.triggerLabel}>
          {value ?? "Escolher ícone"}
        </span>

        <ChevronDown size={16} className={styles.chevron} aria-hidden="true" />
      </button>

      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setBusca("");
        }}
        title="Escolher ícone"
        size="medium"
      >
        <Input
          value={busca}
          onChange={(event) => setBusca(event.target.value)}
          placeholder="Buscar ícone..."
          autoFocus
        />

        {iconesFiltrados.length > 0 ? (
          <div className={styles.grid}>
            {iconesFiltrados.map(({ nome, Icon }) => (
              <button
                key={nome}
                type="button"
                className={[
                  styles.iconButton,
                  value === nome ? styles.selected : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => selecionar(nome)}
                title={nome}
              >
                <Icon size={20} />
                <span className={styles.iconName}>{nome}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className={styles.semResultado}>Nenhum ícone encontrado.</p>
        )}
      </Modal>
    </>
  );
}
