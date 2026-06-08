"use client";

import styles from "../RevisaoProjetoPage.module.css";

export type EstruturaFiltroTipo = "precisaEscolherFocco" | "semCodigoFocco";

type Props = {
  open: boolean;
  x: number;
  y: number;
  hasFilter: boolean;
  onExpandirTudo: () => void;
  onRecolherTudo: () => void;
  onFiltrar: (tipo: EstruturaFiltroTipo) => void;
  onLimparFiltros: () => void;
  onClose: () => void;
};

export default function EstruturaContextMenu({
  open,
  x,
  y,
  hasFilter,
  onExpandirTudo,
  onRecolherTudo,
  onFiltrar,
  onLimparFiltros,
  onClose,
}: Props) {
  if (!open) return null;

  function executar(callback: () => void) {
    callback();
    onClose();
  }

  return (
    <div
      className={styles.contextMenuOverlay}
      onClick={onClose}
      onContextMenu={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div
        className={styles.contextMenu}
        style={{
          top: y,
          left: x,
        }}
        onClick={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.preventDefault()}
      >
        <button
          type="button"
          className={styles.contextMenuItem}
          onClick={() => executar(onExpandirTudo)}
        >
          Expandir toda estrutura
        </button>

        <button
          type="button"
          className={styles.contextMenuItem}
          onClick={() => executar(onRecolherTudo)}
        >
          Recolher toda estrutura
        </button>

        <div className={styles.contextMenuSeparator} />

        <div className={styles.contextMenuGroupTitle}>Filtros</div>

        <button
          type="button"
          className={styles.contextMenuItem}
          onClick={() =>
            executar(() => onFiltrar("precisaEscolherFocco"))
          }
        >
          Exibir itens que precisam escolher item FOCCO
        </button>

        <button
          type="button"
          className={styles.contextMenuItem}
          onClick={() => executar(() => onFiltrar("semCodigoFocco"))}
        >
          Exibir itens sem código FOCCO
        </button>

        {hasFilter && (
          <>
            <div className={styles.contextMenuSeparator} />

            <button
              type="button"
              className={`${styles.contextMenuItem} ${styles.contextMenuItemDanger}`}
              onClick={() => executar(onLimparFiltros)}
            >
              Remover filtros
            </button>
          </>
        )}
      </div>
    </div>
  );
}