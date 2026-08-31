"use client";

import { useEffect, useRef, useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Loader } from "@/components/ui/Loader";
import { Modal } from "@/components/ui/Modal";

import type { ApiEnvelope } from "../services/tvCorporativa.service";
import { visualizarTerminal } from "../services/tvCorporativa.service";
import type { TerminalTv } from "../types/tvCorporativa.types";
import styles from "./VisualizacaoAoVivoModal.module.css";

const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];
const INTERVALO_RENOVACAO_MS = 5000;

type StatusVisualizacao = "conectando" | "aguardando-terminal" | "recebendo" | "erro";

interface VisualizacaoAoVivoModalProps {
  terminal: TerminalTv | null;
  onClose: () => void;
  /*
   * Injeta a versão admin (padrão) ou a restrita (visualizarTerminalTv,
   * ver DispositivosRestritoPainel.tsx) sem duplicar toda a lógica de
   * WebRTC/sinalização deste componente pras duas telas.
   */
  visualizar?: (id: string) => Promise<ApiEnvelope<{ signalingUrl: string; token: string }>>;
}

/*
 * Abrir o modal já inicia a visualização (chama /visualizar, conecta
 * no servidor de sinalização como espectador); fechar encerra tudo —
 * não tem estado "pausado" no meio. Renova o pedido periodicamente
 * (INTERVALO_RENOVACAO_MS) enquanto aberto pra manter o terminal
 * transmitindo (ver JANELA_VISUALIZACAO_MS em src/lib/tv/terminais.ts);
 * parar de renovar (fechar o modal) faz o terminal encerrar sozinho.
 */
export function VisualizacaoAoVivoModal({
  terminal,
  onClose,
  visualizar = visualizarTerminal,
}: VisualizacaoAoVivoModalProps) {
  const [status, setStatus] = useState<StatusVisualizacao>("conectando");
  const [mensagemErro, setMensagemErro] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const renovacaoRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!terminal) return;
    let cancelado = false;

    function encerrar() {
      if (renovacaoRef.current) clearInterval(renovacaoRef.current);
      renovacaoRef.current = null;

      pcRef.current?.close();
      pcRef.current = null;

      wsRef.current?.close();
      wsRef.current = null;

      if (videoRef.current) videoRef.current.srcObject = null;
    }

    async function conectar() {
      setStatus("conectando");
      setMensagemErro(null);

      const resultado = await visualizar(terminal!.id);
      if (cancelado) return;

      if (!resultado.ok || !resultado.data) {
        setStatus("erro");
        setMensagemErro(resultado.message ?? "Não foi possível iniciar a visualização.");
        return;
      }

      const { signalingUrl, token } = resultado.data;
      const ws = new WebSocket(`${signalingUrl}?token=${encodeURIComponent(token)}`);
      wsRef.current = ws;

      ws.onmessage = async (evento) => {
        let mensagem: {
          type: string;
          sdp?: RTCSessionDescriptionInit;
          candidate?: RTCIceCandidateInit;
          message?: string;
        };

        try {
          mensagem = JSON.parse(evento.data);
        } catch {
          return;
        }

        if (mensagem.type === "waiting") {
          setStatus("aguardando-terminal");
        } else if (mensagem.type === "offer" && mensagem.sdp) {
          const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
          pcRef.current = pc;

          pc.ontrack = (eventoTrack) => {
            if (videoRef.current) videoRef.current.srcObject = eventoTrack.streams[0];
          };

          pc.onicecandidate = (eventoIce) => {
            if (eventoIce.candidate) {
              ws.send(JSON.stringify({ type: "ice-candidate", candidate: eventoIce.candidate }));
            }
          };

          await pc.setRemoteDescription(new RTCSessionDescription(mensagem.sdp));
          const resposta = await pc.createAnswer();
          await pc.setLocalDescription(resposta);
          ws.send(JSON.stringify({ type: "answer", sdp: pc.localDescription }));

          setStatus("recebendo");
        } else if (mensagem.type === "ice-candidate" && mensagem.candidate) {
          pcRef.current?.addIceCandidate(new RTCIceCandidate(mensagem.candidate));
        } else if (mensagem.type === "terminal-offline") {
          setStatus("erro");
          setMensagemErro("O terminal desconectou.");
        } else if (mensagem.type === "error") {
          setStatus("erro");
          setMensagemErro(mensagem.message ?? "Erro na sinalização.");
        }
      };

      ws.onerror = () => {
        if (!cancelado) {
          setStatus("erro");
          setMensagemErro("Não foi possível conectar ao servidor de sinalização.");
        }
      };

      renovacaoRef.current = setInterval(() => {
        visualizar(terminal!.id);
      }, INTERVALO_RENOVACAO_MS);
    }

    conectar();

    return () => {
      cancelado = true;
      encerrar();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- visualizar é estável na prática (função top-level importada ou passada fixa pelo pai); incluir na lista reconectaria à toa se o pai não memoizar
  }, [terminal]);

  return (
    <Modal
      open={terminal !== null}
      title={`Visualização ao vivo — ${terminal?.nome ?? ""}`}
      description="Vídeo contínuo da tela do terminal, via WebRTC."
      size="large"
      onClose={onClose}
    >
      <div className={styles.area}>
        <video ref={videoRef} className={styles.video} autoPlay muted playsInline />

        {status !== "recebendo" && (
          <div className={styles.overlay}>
            {status === "erro" ? (
              <Alert variant="danger">{mensagemErro}</Alert>
            ) : (
              <Loader
                label={
                  status === "aguardando-terminal"
                    ? "Aguardando o terminal conectar..."
                    : "Conectando..."
                }
              />
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
