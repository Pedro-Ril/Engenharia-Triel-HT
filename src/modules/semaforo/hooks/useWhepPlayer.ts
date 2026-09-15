"use client";

import { useEffect, useRef, useState } from "react";

import { conectarWhep, type SessaoWhep } from "../lib/whep-client";

export type StatusWhep = "conectando" | "conectado" | "indisponivel";

const TENTATIVAS_MAXIMAS = 3;
const ATRASO_ENTRE_TENTATIVAS_MS = 3000;

/*
 * "ativo" liga/desliga a conexão (o painel flutuante só conecta
 * enquanto está aberto). Retentativa automática porque
 * sourceOnDemand:true no MediaMTX só começa a puxar da câmera de
 * verdade quando o primeiro WHEP chega -- o primeiro POST pode
 * responder antes da câmera estar pronta.
 */
export function useWhepPlayer(whepUrl: string | null, ativo: boolean) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  /* Só é escrito de dentro de tentarConectar, depois de um await -- nunca de forma síncrona no corpo do efeito. */
  const [statusConexao, setStatusConexao] = useState<StatusWhep>("conectando");

  useEffect(() => {
    if (!ativo || !whepUrl) {
      return;
    }

    let cancelado = false;
    let sessaoAtual: SessaoWhep | null = null;
    let temporizador: ReturnType<typeof setTimeout> | null = null;

    async function tentarConectar(tentativa: number) {
      const videoElement = videoRef.current;
      if (!videoElement || cancelado) return;

      try {
        const sessao = await conectarWhep(whepUrl as string, videoElement);

        if (cancelado) {
          await sessao.encerrar();
          return;
        }

        sessaoAtual = sessao;
        setStatusConexao("conectado");

        sessao.peerConnection.addEventListener("connectionstatechange", () => {
          if (cancelado) return;
          const estado = sessao.peerConnection.connectionState;
          if (estado === "failed" || estado === "disconnected" || estado === "closed") {
            setStatusConexao("indisponivel");
          }
        });
      } catch {
        if (cancelado) return;

        if (tentativa < TENTATIVAS_MAXIMAS) {
          temporizador = setTimeout(() => tentarConectar(tentativa + 1), ATRASO_ENTRE_TENTATIVAS_MS);
        } else {
          setStatusConexao("indisponivel");
        }
      }
    }

    tentarConectar(1);

    return () => {
      cancelado = true;
      if (temporizador) clearTimeout(temporizador);
      sessaoAtual?.encerrar();
    };
  }, [whepUrl, ativo]);

  /* Derivado em vez de resetado via setState síncrono no efeito -- enquanto inativo, sempre mostra o placeholder "conectando". */
  const status: StatusWhep = ativo ? statusConexao : "conectando";

  return { videoRef, status };
}
