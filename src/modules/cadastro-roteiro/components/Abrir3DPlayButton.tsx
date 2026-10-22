"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import styles from "@/app/cadastro-roteiro/cadastro-roteiro.module.css";
import {
    abrirModeloNo3DPlay,
    buscarModelos3DPlay,
    Modelo3DPlay,
    type ItemModelo3D,
} from "../services/threeDPlay.service";
import { MENSAGEM_POPUP_BLOQUEADO } from "../utils/abrir-arquivo";
import { useModoAbertura } from "./ModoAberturaArquivos";

type Props = {
    item: ItemModelo3D;
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
    const modoAbertura = useModoAbertura();
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
                if (!abrirModeloNo3DPlay(resultados[0], modoAbertura)) {
                    onErro(MENSAGEM_POPUP_BLOQUEADO);
                }
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

            {/*
                Modal da biblioteca (portal, z-index acima do modal de
                operação). O overlay antigo era inline: o Esc dele subia até
                o onKeyDown do modal de operação e pedia para fechá-lo.

                O portal tira o seletor do DOM do pai, mas NÃO da árvore do
                React: clique, mousedown e tecla continuam subindo até quem
                renderizou o botão (linha da árvore, modal de operação). O
                span segura tudo aqui. Não atrapalha o Esc do Modal, que
                escuta no document -- a mesma raiz onde o React escuta.
            */}
            <span
                className={styles.seletor3DContencao}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
            >
                <Modal
                    open={modalOpen}
                    title="Selecionar modelo 3D"
                    description={`Foram encontrados ${modelos.length} modelos para este item.`}
                    onClose={() => setModalOpen(false)}
                >
                    <div className={styles.seletor3DLista}>
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
                                        setModalOpen(false);

                                        if (!abrirModeloNo3DPlay(modelo, modoAbertura)) {
                                            onErro(MENSAGEM_POPUP_BLOQUEADO);
                                        }
                                    }}
                                >
                                    Abrir
                                </button>
                            </div>
                        ))}
                    </div>
                </Modal>
            </span>
        </>
    );
}