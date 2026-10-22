"use client";

import { useEffect, useRef, useState } from "react";
import styles from "@/app/cadastro-roteiro/cadastro-roteiro.module.css";
import { buscarPdfDetalhamentoItem } from "../services/itemPdf.service";
import { abrirArquivo, MENSAGEM_POPUP_BLOQUEADO } from "../utils/abrir-arquivo";
import { useModoAbertura } from "./ModoAberturaArquivos";

type Props = {
    codigo: string;
    onErro: (mensagem: string) => void;
};

function DocumentIcon() {
    return (
        <svg
            viewBox="0 0 24 24"
            className={styles.pdfItemIcon}
            aria-hidden="true"
        >
            <path
                d="M6 2h8l5 5v15H6V2Zm7 1.8V8h4.2L13 3.8ZM8 11h8v1.6H8V11Zm0 3.5h8v1.6H8v-1.6Zm0 3.5h5v1.6H8V18Z"
                fill="currentColor"
            />
        </svg>
    );
}

export default function AbrirPdfItemButton({ codigo, onErro }: Props) {
    const modoAbertura = useModoAbertura();
    const [loading, setLoading] = useState(false);
    const [progresso, setProgresso] = useState(0);
    /*
     * Fora do try: antes o intervalo era declarado lá dentro e, se a busca
     * falhasse, ninguém o parava -- a barra seguia rodando para sempre.
     * Ref para o finally e o desmontar alcançarem o mesmo timer.
     */
    const timerRef = useRef<number | null>(null);

    function pararProgresso() {
        if (timerRef.current !== null) {
            window.clearInterval(timerRef.current);
            timerRef.current = null;
        }
    }

    /* Fechou o modal (ou a linha sumiu) no meio da busca: para o timer. */
    useEffect(() => {
        const timers = timerRef;
        return () => {
            if (timers.current !== null) window.clearInterval(timers.current);
        };
    }, []);

    async function handleAbrirPdf(e: React.MouseEvent<HTMLButtonElement>) {
        e.stopPropagation();

        try {
            setLoading(true);
            setProgresso(15);

            pararProgresso();
            timerRef.current = window.setInterval(() => {
                setProgresso((prev) => {
                    if (prev >= 90) return prev;
                    return prev + 10;
                });
            }, 250);

            const pdfUrl = await buscarPdfDetalhamentoItem(codigo);

            pararProgresso();
            setProgresso(100);

            if (!abrirArquivo(pdfUrl, "pdf", modoAbertura)) {
                /* Ninguem vai mostrar este PDF: libera ja. */
                URL.revokeObjectURL(pdfUrl);
                onErro(MENSAGEM_POPUP_BLOQUEADO);
            }
        } catch (error) {
            onErro(
                error instanceof Error
                    ? error.message
                    : "Não localizou PDFs para abrir."
            );
        } finally {
            pararProgresso();
            setTimeout(() => {
                setLoading(false);
                setProgresso(0);
            }, 600);
        }
    }

    return (
        <button
            type="button"
            className={styles.pdfItemButton}
            title="Abrir detalhamento em PDF"
            aria-label="Abrir detalhamento em PDF"
            onClick={handleAbrirPdf}
            disabled={loading}
        >
            {loading && (
                <span
                    className={styles.pdfItemButtonProgress}
                    style={{ width: `${progresso}%` }}
                />
            )}

            <span className={styles.pdfItemButtonText}>
                {loading ? `${progresso}%` : <DocumentIcon />}
            </span>
        </button>
    );
}