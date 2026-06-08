"use client";

import styles from "../RevisaoProjetoPage.module.css";
import { EstruturaNode, ItemFoccoOpcao } from "../types/revisaoProjetoTypes";

type Props = {
  open: boolean;
  node: EstruturaNode | null;
  onClose: () => void;
  onEscolher: (opcao: ItemFoccoOpcao) => void;
};

function formatarTexto(valor: string | null | undefined) {
  const texto = String(valor || "").trim();

  return texto || "-";
}

export default function EscolherItemFoccoModal({
  open,
  node,
  onClose,
  onEscolher,
}: Props) {
  if (!open || !node) return null;

  const opcoes = node.opcoesFocco || [];

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div
        className={styles.modalContent}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <div>
            <h3 className={styles.modalTitle}>Escolher item FOCCO</h3>

            <p className={styles.modalSubtitle}>
              O desenho <strong>{node.codigo}</strong> possui mais de um item
              ativo no ERP. Escolha qual código deve ser usado nesta estrutura.
            </p>
          </div>

          <button
            type="button"
            className={styles.modalCloseButton}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className={styles.modalBody}>
          {opcoes.length === 0 ? (
            <div className={styles.emptyState}>
              Nenhuma opção ativa foi encontrada para este desenho.
            </div>
          ) : (
            <div className={styles.foccoOptionsList}>
              {opcoes.map((opcao) => (
                <div
                  key={`${opcao.codDesenho}-${opcao.codItem}`}
                  className={styles.foccoOptionCard}
                >
                  <div className={styles.foccoOptionHeader}>
                    <div>
                      <span className={styles.foccoOptionLabel}>
                        Código FOCCO
                      </span>

                      <strong className={styles.foccoOptionCode}>
                        {opcao.codItem}
                      </strong>
                    </div>

                    <span className={styles.foccoOptionType}>
                      {formatarTexto(opcao.tpItem)}
                    </span>
                  </div>

                  <div className={styles.foccoOptionInfo}>
                    <div className={styles.foccoInfoBlock}>
                      <span className={styles.foccoInfoLabel}>
                        Descrição técnica
                      </span>
                      <strong>{formatarTexto(opcao.descTecnica)}</strong>
                    </div>

                    <div className={styles.foccoInfoBlock}>
                      <span className={styles.foccoInfoLabel}>Resumo</span>
                      <strong>{formatarTexto(opcao.descResumo)}</strong>
                    </div>

                    <div className={styles.foccoInfoGrid}>
                      <div className={styles.foccoInfoBlock}>
                        <span className={styles.foccoInfoLabel}>
                          Cod. desenho
                        </span>
                        <strong>{formatarTexto(opcao.codDesenho)}</strong>
                      </div>

                      <div className={styles.foccoInfoBlock}>
                        <span className={styles.foccoInfoLabel}>Empresa</span>
                        <strong>{opcao.emprId}</strong>
                      </div>
                    </div>
                  </div>

                  <div className={styles.foccoOptionActions}>
                    <button
                      type="button"
                      className={styles.searchButton}
                      onClick={() => onEscolher(opcao)}
                    >
                      Usar este item
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.modalActions}>
          <button
            type="button"
            className={styles.modalSecondaryButton}
            onClick={onClose}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}