"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Toast } from "@/components/ui/Toast";
import styles from "./SemaforoPage.module.css";

type SemaforoResponse = {
  estado?: string;
  verdeOn?: boolean;
  vermelhoOn?: boolean;
  error?: string;
};

type ToastVariant = "success" | "danger" | null;

export default function SemaforoPage() {
  const [carregando, setCarregando] = useState(false);
  const [verdeOn, setVerdeOn] = useState(false);
  const [vermelhoOn, setVermelhoOn] = useState(true);
  const [estado, setEstado] = useState("Desconhecido");
  const [erro, setErro] = useState<string | null>(null);

  const [toastMensagem, setToastMensagem] = useState("");
  const [toastVariant, setToastVariant] = useState<ToastVariant>(null);
  const [toastAberto, setToastAberto] = useState(false);

  const isAberto = useMemo(
    () => estado.toLowerCase() === "aberto",
    [estado]
  );

  const mostrarToast = useCallback((mensagem: string, variant: ToastVariant) => {
    setToastMensagem(mensagem);
    setToastVariant(variant);
    setToastAberto(true);
  }, []);

  const carregarStatus = useCallback(async () => {
    setCarregando(true);
    setErro(null);

    try {
      const response = await fetch("/api/semaforo/status", {
        method: "GET",
        cache: "no-store",
      });

      const data: SemaforoResponse = await response.json();

      if (!response.ok) {
        setErro(data?.error || `Erro ao carregar status (${response.status})`);
        return;
      }

      setEstado((data.estado ?? "Desconhecido").toString());
      setVerdeOn(data.verdeOn === true);
      setVermelhoOn(data.vermelhoOn === true);
    } catch {
      setErro("Falha ao comunicar com o backend.");
    } finally {
      setCarregando(false);
    }
  }, []);

  const toggleSemaforo = useCallback(async () => {
    setCarregando(true);
    setErro(null);

    try {
      const response = await fetch("/api/semaforo/toggle", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data: SemaforoResponse = await response.json();

      if (!response.ok) {
        setErro(data?.error || `Erro ao alternar semáforo (${response.status})`);
        return;
      }

      const novoEstado = (data.estado ?? "Desconhecido").toString();

      setEstado(novoEstado);
      setVerdeOn(data.verdeOn === true);
      setVermelhoOn(data.vermelhoOn === true);

      const abriu = novoEstado.toLowerCase() === "aberto";

      mostrarToast(
        abriu ? "Semáforo liberado." : "Semáforo fechado.",
        abriu ? "success" : "danger"
      );
    } catch {
      setErro("Falha ao comunicar com o backend.");
    } finally {
      setCarregando(false);
    }
  }, [mostrarToast]);

  useEffect(() => {
    carregarStatus();
  }, [carregarStatus]);

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <h1 className={styles.title}>Controle de Semáforo</h1>
          <p className={styles.subtitle}>
            Painel para consulta e alternância do estado
          </p>
        </div>

        <div className={styles.statusBox}>
          <span className={styles.statusLabel}>Estado atual</span>
          <strong
            className={`${styles.statusValue} ${
              isAberto ? styles.statusOpen : styles.statusClosed
            }`}
          >
            {estado.toUpperCase()}
          </strong>
        </div>

        {erro && <div className={styles.errorBox}>{erro}</div>}

        <div className={styles.semaforo}>
          <div
            className={`${styles.luz} ${styles.vermelha} ${
              vermelhoOn ? styles.ligada : styles.desligada
            }`}
          />
          <div
            className={`${styles.luz} ${styles.verde} ${
              verdeOn ? styles.ligada : styles.desligada
            }`}
          />
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            onClick={toggleSemaforo}
            disabled={carregando}
            className={`${styles.button} ${
              isAberto ? styles.buttonClose : styles.buttonOpen
            }`}
          >
            {carregando
              ? "Processando..."
              : isAberto
              ? "Fechar (Vermelho)"
              : "Liberar (Verde)"}
          </button>

          <button
            type="button"
            onClick={carregarStatus}
            disabled={carregando}
            className={`${styles.button} ${styles.buttonSecondary}`}
          >
            Atualizar status
          </button>
        </div>
      </div>

      <Toast
        open={toastAberto}
        title={toastMensagem}
        variant={toastVariant ?? "info"}
        duration={2500}
        onClose={() => setToastAberto(false)}
      />
    </div>
  );
}
