"use client";

import { useEffect, useRef, useState } from "react";
import { TrafficCone, X } from "lucide-react";

import styles from "./CameraFloatingMenu.module.css";

interface CameraFloatingMenuProps {
  estado: string;
  verdeOn: boolean;
  vermelhoOn: boolean;
  carregandoSemaforo: boolean;
  onToggleSemaforo: () => void;
}

/* As câmeras aparecem em tela cheia por baixo (ver CamerasTelaCheia) -- este menu guarda só o controle do semáforo. */
export function CameraFloatingMenu({
  estado,
  verdeOn,
  vermelhoOn,
  carregandoSemaforo,
  onToggleSemaforo,
}: CameraFloatingMenuProps) {
  const [aberto, setAberto] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isAberto = estado.toLowerCase() === "aberto";

  useEffect(() => {
    function handleClickFora(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setAberto(false);
      }
    }

    if (aberto) {
      document.addEventListener("mousedown", handleClickFora);
    }

    return () => document.removeEventListener("mousedown", handleClickFora);
  }, [aberto]);

  return (
    <div ref={containerRef} className={styles.container}>
      {aberto && (
        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>Semáforo</h2>

          <div className={styles.semaforoRow}>
            <span className={styles.semaforoEstado}>
              <span
                className={styles.semaforoLuz}
                style={{ background: vermelhoOn ? "#ef4444" : "var(--border-soft)" }}
              />
              <span
                className={styles.semaforoLuz}
                style={{ background: verdeOn ? "#22c55e" : "var(--border-soft)" }}
              />
              {estado.toUpperCase()}
            </span>

            <button
              type="button"
              className={`${styles.semaforoBotao} ${isAberto ? styles.semaforoBotaoFechar : styles.semaforoBotaoAbrir}`}
              onClick={onToggleSemaforo}
              disabled={carregandoSemaforo}
            >
              {carregandoSemaforo ? "Processando..." : isAberto ? "Fechar" : "Liberar"}
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        className={styles.toggleButton}
        onClick={() => setAberto((atual) => !atual)}
        aria-label={aberto ? "Fechar menu do semáforo" : "Abrir menu do semáforo"}
      >
        {aberto ? <X size={22} /> : <TrafficCone size={22} />}
        <span
          className={`${styles.statusDot} ${isAberto ? styles.statusDotAberto : styles.statusDotFechado}`}
          aria-hidden="true"
        />
      </button>
    </div>
  );
}
