"use client";

import styles from "../RevisaoProjetoPage.module.css";
import { EstruturaNode } from "../types/revisaoProjetoTypes";

export type ItemComEscolhaFocco = {
    node: EstruturaNode;
    nodeKey: string;
};

type Props = {
    open: boolean;
    itens: ItemComEscolhaFocco[];
    onClose: () => void;
    onAbrirEscolha: (item: ItemComEscolhaFocco) => void;
};

function formatarTexto(valor: string | null | undefined) {
    const texto = String(valor || "").trim();

    return texto || "-";
}

export default function ResumoItensFoccoModal({
    open,
    itens,
    onClose,
    onAbrirEscolha,
}: Props) {
    if (!open) return null;

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div
                className={styles.modalContent}
                onClick={(event) => event.stopPropagation()}
            >
                <div className={styles.modalHeader}>
                    <div>
                        <h3 className={styles.modalTitle}>Itens com múltiplos códigos FOCCO</h3>

                        <p className={styles.modalSubtitle}>
                            Estes itens possuem mais de um código ativo no ERP. Escolha qual
                            código deve ser usado em cada item da estrutura.
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
                    {itens.length === 0 ? (
                        <div className={styles.emptyState}>
                            Nenhum item pendente de escolha FOCCO.
                        </div>
                    ) : (
                        <div className={styles.foccoResumoList}>
                            {itens.map((item) => {
                                const node = item.node;

                                return (
                                    <div key={item.nodeKey} className={styles.foccoResumoCard}>
                                        <div className={styles.foccoResumoContent}>
                                            <div>
                                                <span className={styles.foccoInfoLabel}>Código desenho</span>
                                                <strong className={styles.foccoResumoCodigo}>
                                                    {node.codigo}
                                                </strong>
                                            </div>

                                            <div>
                                                <span className={styles.foccoInfoLabel}>Descrição</span>
                                                <strong>{formatarTexto(node.descricao)}</strong>
                                            </div>
                                        </div>

                                        <div className={styles.foccoResumoActions}>
                                            <button
                                                type="button"
                                                className={styles.searchButton}
                                                onClick={() => onAbrirEscolha(item)}
                                            >
                                                Escolher item
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className={styles.modalActions}>
                    <button
                        type="button"
                        className={styles.modalSecondaryButton}
                        onClick={onClose}
                    >
                        Fechar
                    </button>
                </div>
            </div>
        </div>
    );
}