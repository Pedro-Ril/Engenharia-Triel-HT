"use client";

import { useEffect, useRef, useState } from "react";

import styles from "@/app/cadastro-roteiro/cadastro-roteiro.module.css";

import type { RoteiroTreeNode } from "../types/cadastroRoteiro.types";
import AbrirPdfItemButton from "./AbrirPdfItemButton";
import Abrir3DPlayButton from "./Abrir3DPlayButton";
import { codigoDoPdf } from "../utils/codigo-pdf";

/*
 * O mesmo item usado em mais de um conjunto da estrutura consultada: o
 * cabeçalho mostra o pai de onde o modal foi aberto, e este menu lista
 * os outros, com o 2D e o 3D de cada um.
 *
 * Abre flutuando, como a implosão (PaisNoErp), para não empurrar o
 * formulário.
 */
export function OutrosPaisMenu({
    pais,
    onErro,
}: {
    pais: RoteiroTreeNode[];
    onErro: (mensagem: string) => void;
}) {
    const [aberto, setAberto] = useState(false);
    const caixaRef = useRef<HTMLDivElement | null>(null);

    /* Fecha ao clicar fora ou com Esc -- mesmo padrão dos menus do portal. */
    useEffect(() => {
        if (!aberto) return;

        function aoClicarFora(evento: MouseEvent) {
            if (caixaRef.current && !caixaRef.current.contains(evento.target as Node)) {
                setAberto(false);
            }
        }

        function aoTeclar(evento: KeyboardEvent) {
            if (evento.key === "Escape") {
                evento.stopPropagation();
                setAberto(false);
            }
        }

        document.addEventListener("mousedown", aoClicarFora);
        document.addEventListener("keydown", aoTeclar, true);

        return () => {
            document.removeEventListener("mousedown", aoClicarFora);
            document.removeEventListener("keydown", aoTeclar, true);
        };
    }, [aberto]);

    if (pais.length === 0) return null;

    const rotulo = `+${pais.length} ${pais.length === 1 ? "pai" : "pais"}`;

    return (
        <div className={styles.paisErp} ref={caixaRef}>
            <button
                type="button"
                className={styles.botaoCompacto}
                aria-expanded={aberto}
                aria-haspopup="dialog"
                title="Outros conjuntos desta estrutura que também usam o item"
                onClick={() => setAberto((atual) => !atual)}
            >
                {rotulo}
            </button>

            {aberto && (
                <div
                    className={`${styles.paisErpPainel} ${styles.paisErpPainelDireita}`}
                    role="dialog"
                    aria-label="Outros pais na estrutura"
                >
                    <strong className={styles.paisErpTitulo}>
                        Também usado em
                        <span>
                            {pais.length} {pais.length === 1 ? "conjunto" : "conjuntos"} desta estrutura
                        </span>
                    </strong>

                    <ul className={styles.paisErpLista}>
                        {pais.map((pai) => (
                            <li key={pai.id} className={styles.recursoLinha}>
                                <span className={styles.recursoNome}>
                                    <strong>
                                        {pai.codigoNormalizado} | {pai.revisao || "-"}
                                    </strong>
                                    {pai.descricaoNormalizada && <span>{pai.descricaoNormalizada}</span>}
                                </span>

                                <div className={styles.acoesNaLinha}>
                                    <AbrirPdfItemButton codigo={codigoDoPdf(pai)} onErro={onErro} />
                                    <Abrir3DPlayButton item={pai} onErro={onErro} />
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
