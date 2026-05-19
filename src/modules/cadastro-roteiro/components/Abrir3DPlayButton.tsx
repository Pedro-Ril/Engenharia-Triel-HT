"use client";

import { useState } from "react";
import styles from "@/app/cadastro-roteiro/cadastro-roteiro.module.css";
import { RoteiroTreeNode } from "../types/cadastroRoteiro.types";
import {
    abrirModeloNo3DPlay,
    buscarModelos3DPlay,
    Modelo3DPlay,
} from "../services/threeDPlay.service";

type Props = {
    item: RoteiroTreeNode;
    onErro: (mensagem: string) => void;
};

function CubeIcon() {
    return (
        <svg
            viewBox="0 0 24 24"
            className={styles.play3DIcon}
            aria-hidden="true"
        >
            <path
                d="M12 2 4 6.3v11.4L12 22l8-4.3V6.3L12 2Zm0 2.3 5.4 2.9L12 10.1 6.6 7.2 12 4.3ZM6 9l5 2.7v7.1l-5-2.7V9Zm12 7.1-5 2.7v-7.1L18 9v7.1Z"
                fill="currentColor"
            />
        </svg>
    );
}

export default function Abrir3DPlayButton({ item, onErro }: Props) {
    const [loading, setLoading] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [modelos, setModelos] = useState<Modelo3DPlay[]>([]);

    async function handleAbrir3D(e: React.MouseEvent<HTMLButtonElement>) {
        e.stopPropagation();

        try {
            setLoading(true);

            const resultados = await buscarModelos3DPlay(item);

            if (resultados.length === 0) {
                onErro("Nenhum modelo 3D encontrado para este item e revisão.");
                return;
            }

            if (resultados.length === 1) {
                abrirModeloNo3DPlay(resultados[0]);
                return;
            }

            setModelos(resultados);
            setModalOpen(true);
        } catch (error) {
            onErro(
                error instanceof Error
                    ? error.message
                    : "Não foi possível abrir o item no 3DPlay."
            );
        } finally {
            setLoading(false);
        }
    }

    return (
        <>
            <button
                type="button"
                className={styles.play3DButton}
                title="Visualizar no 3DPlay"
                aria-label="Visualizar no 3DPlay"
                onClick={handleAbrir3D}
                disabled={loading}
            >
                {loading ? "..." : <CubeIcon />}
            </button>

            {modalOpen && (
                <div
                    className={styles.modalOverlay}
                    onClick={(e) => {
                        e.stopPropagation();
                        setModalOpen(false);
                    }}
                >
                    <div
                        className={styles.modalContent}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className={styles.modalHeader}>
                            <div>
                                <h3 className={styles.modalTitle}>
                                    Selecionar modelo 3D
                                </h3>
                                <p className={styles.modalSubtitle}>
                                    Foram encontrados {modelos.length} modelos para este item.
                                </p>
                            </div>

                            <button
                                type="button"
                                className={styles.modalCloseButton}
                                onClick={() => setModalOpen(false)}
                            >
                                ×
                            </button>
                        </div>

                        <div className={styles.modalTableWrapper}>
                            {modelos.map((modelo) => (
                                <div
                                    key={modelo.physicalId}
                                    className={styles.modelo3DCard}
                                >
                                    <div className={styles.modelo3DInfo}>
                                        <strong>
                                            {modelo.titulo || modelo.codigo}
                                        </strong>

                                        <span>
                                            Revisão: {modelo.revisao || "-"}
                                        </span>
                                    </div>

                                    <button
                                        type="button"
                                        className={styles.modelo3DOpenButton}
                                        onClick={() => {
                                            abrirModeloNo3DPlay(modelo);
                                            setModalOpen(false);
                                        }}
                                    >
                                        Abrir
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}