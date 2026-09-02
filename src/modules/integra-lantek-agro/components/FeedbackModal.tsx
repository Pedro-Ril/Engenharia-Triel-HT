"use client";

import { useEffect, useState } from "react";
import styles from "@/modules/integra-lantek-shared/components/FeedbackModal.module.css";

type ResumoOrdensAgrupado = {
  material: string;
  espessura: string;
  ordens: string[];
};

type Props = {
  open: boolean;
  title: string;
  message: string;
  resumoOrdensAgrupado?: ResumoOrdensAgrupado[];
  onClose: () => void;
};

function CopyIcon({ copied = false }: { copied?: boolean }) {
  if (copied) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.copyIconSvg}>
        <path
          d="M20 6L9 17l-5-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.copyIconSvg}>
      <rect x="9" y="9" width="10" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <path
        d="M15 9V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.closeIconSvg}>
      <path
        d="M18 6L6 18M6 6l12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function FeedbackModal({
  open,
  title,
  message,
  resumoOrdensAgrupado = [],
  onClose,
}: Props) {
  const [copiadoGrupo, setCopiadoGrupo] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const linhasMensagem = message
    .split("\n")
    .map((linha) => linha.trim())
    .filter(Boolean);

  // Copia apenas os números das ordens, separados por vírgula
  async function handleCopiarOrdens(identificador: string, ordens: string[]) {
    try {
      await navigator.clipboard.writeText(ordens.join(", "));

      setCopiadoGrupo(identificador);

      window.setTimeout(() => {
        setCopiadoGrupo((atual) => (atual === identificador ? null : atual));
      }, 1800);
    } catch (error) {
      console.error("Erro ao copiar ordens:", error);
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.modal}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-modal-title"
      >
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.topIconWrap}>
              <div className={styles.topIcon}>✓</div>
            </div>

            <div className={styles.headerText}>
              <h2 id="feedback-modal-title" className={styles.title}>
                {title}
              </h2>

              {linhasMensagem.length > 0 && (
                <div className={styles.messageBlock}>
                  {linhasMensagem.map((linha, index) => (
                    <p key={`${linha}-${index}`} className={styles.messageLine}>
                      {linha}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className={styles.closeButton}
            aria-label="Fechar modal"
          >
            <CloseIcon />
          </button>
        </div>

        <div className={styles.content}>
          {resumoOrdensAgrupado.length > 0 && (
            <div className={styles.resumoWrapper}>
              <div className={styles.resumoHeader}>
                <div>
                  <h3 className={styles.resumoTitle}>
                    Resumo por material e espessura
                  </h3>
                  <p className={styles.resumoHint}>
                    Visualize e copie rapidamente as ordens agrupadas por combinação
                  </p>
                </div>

                <span className={styles.badgeTotal}>
                  {resumoOrdensAgrupado.length} grupo(s)
                </span>
              </div>

              <div className={styles.resumoGrid}>
                {resumoOrdensAgrupado.map((grupo, index) => {
                  const identificador = `${grupo.material}-${grupo.espessura}-${index}`;
                  const copiado = copiadoGrupo === identificador;

                  return (
                    <div key={identificador} className={styles.resumoCard}>
                      <div className={styles.cardTop}>
                        <div className={styles.cardInfo}>
                          <span className={styles.resumoLabel}>Material</span>
                          <span className={styles.resumoMaterial}>
                            {grupo.material || "-"}
                          </span>

                          <span className={styles.resumoLabel}>Espessura</span>
                          <span className={styles.resumoEspessura}>
                            {grupo.espessura || "-"}
                          </span>
                        </div>

                        <button
                          type="button"
                          className={`${styles.copyIconButton} ${copiado ? styles.copyIconButtonSuccess : ""}`}
                          onClick={() => handleCopiarOrdens(identificador, grupo.ordens)}
                          title={copiado ? "Copiado!" : "Copiar ordens"}
                          aria-label={copiado ? "Copiado!" : "Copiar ordens"}
                        >
                          <CopyIcon copied={copiado} />
                        </button>
                      </div>

                      <strong className={styles.resumoCount}>
                        {grupo.ordens.length} {grupo.ordens.length === 1 ? "ordem" : "ordens"}
                      </strong>

                      <div className={styles.ordensBox}>
                        <p className={styles.resumoOrdens}>
                          {grupo.ordens.join(", ")}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <button type="button" onClick={onClose} className={styles.primaryButton}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}