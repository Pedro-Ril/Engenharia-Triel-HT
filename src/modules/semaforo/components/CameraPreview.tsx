"use client";

import { useWhepPlayer } from "../hooks/useWhepPlayer";
import styles from "./CameraPreview.module.css";

interface CameraPreviewProps {
  whepUrl: string;
  ativo: boolean;
}

/*
 * <video> + conexão WHEP + overlay de status -- usado tanto na tela
 * cheia de monitoramento (CamerasTelaCheia) quanto no preview da tela
 * de cadastro de câmera no admin (SemaforoConfigPainel), pra manter os
 * dois em sincronia em vez de duplicar a lógica de conexão duas vezes.
 */
export function CameraPreview({ whepUrl, ativo }: CameraPreviewProps) {
  const { videoRef, status } = useWhepPlayer(whepUrl, ativo);

  return (
    <div className={styles.box}>
      <video ref={videoRef} className={styles.video} autoPlay playsInline muted />
      {status !== "conectado" && (
        <div className={styles.overlay}>
          {status === "conectando" ? "Conectando..." : "Câmera indisponível no momento"}
        </div>
      )}
    </div>
  );
}
