"use client";

import { useState } from "react";
import styles from "@/app/cadastro-roteiro/cadastro-roteiro.module.css";
import { buscarPdfDetalhamentoItem } from "../services/itemPdf.service";

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
    const [loading, setLoading] = useState(false);
    const [progresso, setProgresso] = useState(0);

    async function handleAbrirPdf(e: React.MouseEvent<HTMLButtonElement>) {
        e.stopPropagation();

        try {
            setLoading(true);
            setProgresso(15);

            const timer = window.setInterval(() => {
                setProgresso((prev) => {
                    if (prev >= 90) return prev;
                    return prev + 10;
                });
            }, 250);

            const pdfUrl = await buscarPdfDetalhamentoItem(codigo);

            window.clearInterval(timer);
            setProgresso(100);

            window.open(pdfUrl, "_blank");
        } catch (error) {
            onErro(
                error instanceof Error
                    ? error.message
                    : "Não localizou PDFs para abrir."
            );
        } finally {
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