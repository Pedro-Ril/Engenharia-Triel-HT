"use client";

import { useCallback, useEffect, useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Toast } from "@/components/ui/Toast";

import { CameraFloatingMenu } from "./CameraFloatingMenu";
import { CamerasGrid } from "./CamerasGrid";

type SemaforoResponse = {
  estado?: string;
  verdeOn?: boolean;
  vermelhoOn?: boolean;
  error?: string;
};

type ToastVariant = "success" | "danger" | null;

/*
 * Cópia própria do fetch de status/toggle (mesmo backend do
 * SemaforoPage.tsx original, inalterado) -- de propósito, pra manter
 * o modo legado livre de qualquer risco de regressão: zero lógica
 * compartilhada entre as duas telas.
 */
export function SemaforoPageReformulado() {
  const [carregando, setCarregando] = useState(false);
  const [verdeOn, setVerdeOn] = useState(false);
  const [vermelhoOn, setVermelhoOn] = useState(true);
  const [estado, setEstado] = useState("Desconhecido");
  const [erro, setErro] = useState<string | null>(null);

  const [toastMensagem, setToastMensagem] = useState("");
  const [toastVariant, setToastVariant] = useState<ToastVariant>(null);
  const [toastAberto, setToastAberto] = useState(false);

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

      mostrarToast(abriu ? "Semáforo liberado." : "Semáforo fechado.", abriu ? "success" : "danger");
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
    <>
      <PageContainer>
        <PageHeader
          title="Controle de Semáforo"
          description="Visualize as câmeras e controle o semáforo pelo menu no canto da tela."
        />

        {erro && <Alert variant="danger">{erro}</Alert>}

        <CamerasGrid />
      </PageContainer>

      <CameraFloatingMenu
        estado={estado}
        verdeOn={verdeOn}
        vermelhoOn={vermelhoOn}
        carregandoSemaforo={carregando}
        onToggleSemaforo={toggleSemaforo}
      />

      <Toast
        open={toastAberto}
        title={toastMensagem}
        variant={toastVariant ?? "info"}
        duration={2500}
        onClose={() => setToastAberto(false)}
      />
    </>
  );
}
