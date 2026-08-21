"use client";

import type { ReactNode } from "react";

import styles from "./AdminPermissoes.module.css";

export interface ItemNavegacaoAdmin {
  valor: string;
  label: string;
  icon: ReactNode;
}

export interface GrupoNavegacaoAdmin {
  titulo: string;
  itens: ItemNavegacaoAdmin[];
}

interface AdminNavegacaoProps {
  grupos: GrupoNavegacaoAdmin[];
  ativo: string;
  onSelecionar: (valor: string) => void;
}

export function AdminNavegacao({
  grupos,
  ativo,
  onSelecionar,
}: AdminNavegacaoProps) {
  return (
    <nav className={styles.navAdmin} aria-label="Seções da administração">
      {grupos.map((grupo) => (
        <div key={grupo.titulo} className={styles.navAdminGrupo}>
          <span className={styles.navAdminGrupoTitulo}>{grupo.titulo}</span>

          {grupo.itens.map((item) => (
            <button
              key={item.valor}
              type="button"
              className={`${styles.navAdminItem} ${
                item.valor === ativo ? styles.navAdminItemAtivo : ""
              }`}
              aria-current={item.valor === ativo ? "page" : undefined}
              onClick={() => onSelecionar(item.valor)}
            >
              <span className={styles.navAdminItemIcon}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}
