"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import styles from "./TvPlayer.module.css";

const CHAVE_HARDWARE_ID = "tv-hardware-id";
const CHAVE_TOKEN = "tv-device-token";
const INTERVALO_PAREAMENTO_MS = 3000;
const INTERVALO_HEARTBEAT_MS = 60000;
const INTERVALO_VERIFICAR_TRANSMISSAO_MS = 5000;
const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

/*
 * ID fixo da extensão "captura de tela" (ver
 * src/lib/tv/extensao-captura.ts, mesma constante calculada lá a
 * partir da mesma chave pública — mantidos em sincronia manualmente
 * já que um é server-only e o outro roda no cliente) — instalada via
 * política do Chrome (ExtensionInstallForcelist, ver instalar.sh),
 * não por --load-extension (Google Chrome oficial ignora essa flag
 * fora do modo desenvolvedor — confirmado ao vivo). getDisplayMedia()
 * com --auto-select-desktop-capture-source mostrou-se pouco confiável
 * nesse tipo de X11 mínimo sem ambiente de desktop (o atalho de
 * "fake UI" fabrica um ID de tela que não bate com o real que o
 * capturador X11 espera — visto ao vivo: "NotReadableError: Could not
 * start video source" mesmo com a fonte "selecionada").
 * chrome.desktopCapture, chamado de dentro da extensão, passa pelo
 * mesmo caminho de enumeração REAL de telas que o capturador usa,
 * evitando esse descompasso.
 */
const EXTENSAO_CAPTURA_ID = "pijkeheicmcpihjdmpfgfnlcpmmklknp";

interface RuntimeExtensaoChrome {
  sendMessage: (
    extensionId: string,
    message: unknown,
    callback: (resposta: { streamId: string | null } | undefined) => void
  ) => void;
  lastError?: { message: string };
}

declare global {
  interface Window {
    chrome?: { runtime?: RuntimeExtensaoChrome };
  }
}

/*
 * Só existe quando a extensão de captura está de fato instalada e
 * corresponde ao "externally_connectable" dela (ver manifest.json
 * gerado por instalar.sh) — o Chrome injeta esse objeto sozinho em
 * páginas que casam, sem precisar de content script nenhum. Serve
 * também de detector: se não existir (testando /tv num navegador
 * comum, fora do kiosk), cai pro getDisplayMedia() padrão abaixo.
 */
const TENTATIVAS_MENSAGEM_EXTENSAO = 5;
const INTERVALO_TENTATIVA_EXTENSAO_MS = 1000;

/*
 * Logo após instalar/reinstalar o agente (ex: perfil do Chrome
 * limpo), a extensão ainda está sendo baixada e instalada pela
 * política do Chrome (ExtensionInstallForcelist) no exato momento em
 * que o player tenta a primeira captura — sendMessage falha nessa
 * janela com "Could not establish connection. Receiving end does not
 * exist." (visto ao vivo). Repetir por alguns segundos cobre essa
 * corrida sem exigir sincronismo exato com a instalação da extensão.
 */
async function enviarMensagemComRetentativa(
  runtime: RuntimeExtensaoChrome
): Promise<string | null> {
  for (let tentativa = 0; tentativa < TENTATIVAS_MENSAGEM_EXTENSAO; tentativa++) {
    if (tentativa > 0) {
      await new Promise((resolve) => setTimeout(resolve, INTERVALO_TENTATIVA_EXTENSAO_MS));
    }

    const resposta = await new Promise<{ streamId: string | null } | undefined>((resolve) => {
      runtime.sendMessage(EXTENSAO_CAPTURA_ID, "capturar-tela", (r) => {
        void runtime.lastError; // só pra evitar "Unchecked runtime.lastError" no console
        resolve(r);
      });
    });

    if (resposta?.streamId) return resposta.streamId;
  }

  return null;
}

async function capturarTelaViaExtensao(): Promise<MediaStream> {
  const runtime = window.chrome?.runtime;
  if (!runtime?.sendMessage) {
    throw new Error("Extensão de captura de tela não está instalada.");
  }

  const streamId = await enviarMensagemComRetentativa(runtime);
  if (!streamId) {
    throw new Error("Extensão de captura de tela não respondeu (pode ainda estar instalando).");
  }

  return navigator.mediaDevices.getUserMedia({
    video: {
      mandatory: { chromeMediaSource: "desktop", chromeMediaSourceId: streamId },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- "mandatory"/chromeMediaSource é uma extensão não-padrão do Chrome, fora do tipo MediaStreamConstraints
  } as any);
}

interface ItemGrade {
  id: string;
  tipoConteudo: "video" | "foto" | "documento" | "pagina_web";
  duracaoSegundos: number;
  urlPaginaWeb: string | null;
  midia: { id: string; url: string; tipoMime: string } | null;
}

interface RespostaGradeAtual {
  slot: { slotId: string; itens: ItemGrade[] } | null;
  intervaloAtualizacaoSegundos: number;
}

/*
 * hardwareId "de verdade" vem do agente nativo (identificador real do
 * sistema operacional — ver plano da TV Corporativa), entregue via
 * ?hardwareId= na URL logo no primeiro lançamento do Chrome, antes de
 * qualquer pareamento existir (o agente não faz seu próprio polling
 * de pareamento antes de abrir o navegador — ver tv-agente/agente.mjs
 * — porque isso deixava a tela de código invisível: o agente só
 * escreve em stdout, que fica inacessível assim que o X toma conta da
 * tela em modo gráfico). Persistido em localStorage pra sobreviver a
 * navegações dentro do próprio /tv. Enquanto não há agente rodando
 * (testando direto no navegador), gera e persiste um UUID como
 * substituto — funciona pra testar o fluxo inteiro, mas não tem a
 * robustez de um identificador de hardware real (sobrevive a fechar a
 * aba, mas não a limpar dados do navegador).
 */
function obterOuCriarHardwareId(hardwareIdDaUrl: string | null): string {
  if (hardwareIdDaUrl) {
    localStorage.setItem(CHAVE_HARDWARE_ID, hardwareIdDaUrl);
    return hardwareIdDaUrl;
  }

  const existente = localStorage.getItem(CHAVE_HARDWARE_ID);
  if (existente) return existente;

  const novo = crypto.randomUUID();
  localStorage.setItem(CHAVE_HARDWARE_ID, novo);
  return novo;
}

export function TvPlayer() {
  const [hardwareId, setHardwareId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [codigo, setCodigo] = useState<string | null>(null);
  const [grade, setGrade] = useState<RespostaGradeAtual | null>(null);
  const [indiceAtual, setIndiceAtual] = useState(0);
  const avancarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const signalingWsRef = useRef<WebSocket | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const streamCapturaRef = useRef<MediaStream | null>(null);
  const transmitindoRef = useRef(false);

  /*
   * ?token= na URL é o handoff do agente nativo depois do pareamento
   * (ver plano) — lido e persistido uma vez, sem depender de
   * localStorage já existir.
   */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenDaUrl = params.get("token");
    const hardwareIdDaUrl = params.get("hardwareId");

    if (tokenDaUrl) {
      localStorage.setItem(CHAVE_TOKEN, tokenDaUrl);
    }
    if (tokenDaUrl || hardwareIdDaUrl) {
      window.history.replaceState(null, "", "/tv");
    }

    setHardwareId(obterOuCriarHardwareId(hardwareIdDaUrl));
    setToken(localStorage.getItem(CHAVE_TOKEN));
  }, []);

  const consultarPareamento = useCallback(async () => {
    if (!hardwareId) return;

    try {
      const response = await fetch(
        `/api/tv/pareamento?hardwareId=${encodeURIComponent(hardwareId)}`
      );
      const body = await response.json();
      if (!body.ok) return;

      if (body.data.pareado) {
        if (body.data.deviceToken) {
          localStorage.setItem(CHAVE_TOKEN, body.data.deviceToken);
          setToken(body.data.deviceToken);
        }
      } else {
        setCodigo(body.data.codigo);
      }
    } catch {
      /* Sem conexão momentânea — tenta de novo no próximo ciclo. */
    }
  }, [hardwareId]);

  useEffect(() => {
    if (!hardwareId || token) return;

    consultarPareamento();
    const intervalo = setInterval(consultarPareamento, INTERVALO_PAREAMENTO_MS);
    return () => clearInterval(intervalo);
  }, [hardwareId, token, consultarPareamento]);

  const buscarGradeAtual = useCallback(async () => {
    if (!token) return;

    try {
      const response = await fetch("/api/tv/grade-atual", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 401) {
        /* Token revogado — volta pra tela de pareamento. */
        localStorage.removeItem(CHAVE_TOKEN);
        setToken(null);
        return;
      }

      const body = await response.json();
      if (body.ok) {
        setGrade(body.data);
        setIndiceAtual((atual) =>
          body.data?.slot && atual >= body.data.slot.itens.length ? 0 : atual
        );
      }
    } catch {
      /* Sem conexão momentânea — mantém o item atual em exibição. */
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;

    buscarGradeAtual();
    const intervaloMs = (grade?.intervaloAtualizacaoSegundos ?? 30) * 1000;
    const intervalo = setInterval(buscarGradeAtual, intervaloMs);
    return () => clearInterval(intervalo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, buscarGradeAtual]);

  useEffect(() => {
    if (!token) return;

    const enviar = () => {
      fetch("/api/tv/heartbeat", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    };

    enviar();
    const intervalo = setInterval(enviar, INTERVALO_HEARTBEAT_MS);
    return () => clearInterval(intervalo);
  }, [token]);

  /*
   * Visualização ao vivo (WebRTC) — captura a própria tela e transmite
   * pro admin que estiver assistindo, via o servidor de sinalização
   * separado (tv-signaling/server.mjs). getDisplayMedia() pede
   * permissão ao usuário; num terminal de verdade lançado pelo agente
   * nativo com --use-fake-ui-for-media-stream essa permissão é
   * aceita automaticamente (ver plano da TV Corporativa) — testando
   * direto num navegador comum, o Chrome mostra o prompt normal.
   */
  const pararTransmissao = useCallback(() => {
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;

    streamCapturaRef.current?.getTracks().forEach((faixa) => faixa.stop());
    streamCapturaRef.current = null;

    signalingWsRef.current?.close();
    signalingWsRef.current = null;

    transmitindoRef.current = false;
  }, []);

  const iniciarCaptura = useCallback(async (ws: WebSocket) => {
    try {
      const stream = window.chrome?.runtime
        ? await capturarTelaViaExtensao()
        : await navigator.mediaDevices.getDisplayMedia({ video: true });
      streamCapturaRef.current = stream;

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      peerConnectionRef.current = pc;

      for (const faixa of stream.getTracks()) {
        pc.addTrack(faixa, stream);
      }

      pc.onicecandidate = (evento) => {
        if (evento.candidate) {
          ws.send(JSON.stringify({ type: "ice-candidate", candidate: evento.candidate }));
        }
      };

      const oferta = await pc.createOffer();
      await pc.setLocalDescription(oferta);
      ws.send(JSON.stringify({ type: "offer", sdp: pc.localDescription }));
    } catch (error) {
      console.error("Erro ao capturar tela para visualização ao vivo:", error);
      pararTransmissao();
    }
  }, [pararTransmissao]);

  const iniciarTransmissao = useCallback(
    (signalingUrl: string) => {
      if (!token || transmitindoRef.current) return;
      transmitindoRef.current = true;

      const ws = new WebSocket(`${signalingUrl}?token=${encodeURIComponent(token)}`);
      signalingWsRef.current = ws;

      ws.onmessage = (evento) => {
        let mensagem: { type: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };

        try {
          mensagem = JSON.parse(evento.data);
        } catch {
          return;
        }

        if (mensagem.type === "watch-request") {
          iniciarCaptura(ws);
        } else if (mensagem.type === "answer" && mensagem.sdp) {
          peerConnectionRef.current?.setRemoteDescription(
            new RTCSessionDescription(mensagem.sdp)
          );
        } else if (mensagem.type === "ice-candidate" && mensagem.candidate) {
          peerConnectionRef.current?.addIceCandidate(new RTCIceCandidate(mensagem.candidate));
        } else if (mensagem.type === "viewer-left" || mensagem.type === "error") {
          pararTransmissao();
        }
      };

      ws.onclose = () => {
        pararTransmissao();
      };
    },
    [token, iniciarCaptura, pararTransmissao]
  );

  useEffect(() => {
    if (!token) return;

    async function verificarTransmissao() {
      try {
        const response = await fetch("/api/tv/deve-transmitir", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = await response.json();
        if (!body.ok) return;

        if (body.data.transmitir && body.data.signalingUrl && !transmitindoRef.current) {
          iniciarTransmissao(body.data.signalingUrl);
        } else if (!body.data.transmitir && transmitindoRef.current) {
          pararTransmissao();
        }
      } catch {
        /* Sem conexão momentânea — tenta de novo no próximo ciclo. */
      }
    }

    verificarTransmissao();
    const intervalo = setInterval(verificarTransmissao, INTERVALO_VERIFICAR_TRANSMISSAO_MS);
    return () => {
      clearInterval(intervalo);
      pararTransmissao();
    };
  }, [token, iniciarTransmissao, pararTransmissao]);

  const itens = grade?.slot?.itens ?? [];
  const itemAtual = itens[indiceAtual] ?? null;

  const avancar = useCallback(() => {
    setIndiceAtual((atual) => (itens.length > 0 ? (atual + 1) % itens.length : 0));
  }, [itens.length]);

  useEffect(() => {
    if (avancarTimerRef.current) clearTimeout(avancarTimerRef.current);
    if (!itemAtual || itemAtual.tipoConteudo === "video") return;

    avancarTimerRef.current = setTimeout(avancar, itemAtual.duracaoSegundos * 1000);
    return () => {
      if (avancarTimerRef.current) clearTimeout(avancarTimerRef.current);
    };
  }, [itemAtual, avancar]);

  if (!token) {
    return (
      <main className={styles.pagina}>
        <div className={styles.telaCodigo}>
          <span className={styles.rotulo}>Código de pareamento</span>
          <strong className={styles.codigo}>{codigo ?? "------"}</strong>
          <p className={styles.instrucao}>
            Em Administração → TV Corporativa → Dispositivos, digite este código pra
            vincular esta tela.
          </p>
        </div>
      </main>
    );
  }

  if (!itemAtual) {
    return (
      <main className={styles.pagina}>
        <div className={styles.telaCodigo}>
          <span className={styles.rotulo}>Terminal pareado</span>
          <p className={styles.instrucao}>
            Nenhuma programação vigente no momento — atribua uma grade a este terminal.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.pagina}>
      {itemAtual.tipoConteudo === "video" && itemAtual.midia && (
        <video
          key={itemAtual.id}
          className={styles.midia}
          src={itemAtual.midia.url}
          autoPlay
          muted
          onEnded={avancar}
        />
      )}

      {itemAtual.tipoConteudo === "foto" && itemAtual.midia && (
        // eslint-disable-next-line @next/next/no-img-element -- imagem de programação vinda de disco, não do pipeline de otimização do Next
        <img key={itemAtual.id} className={styles.midia} src={itemAtual.midia.url} alt="" />
      )}

      {itemAtual.tipoConteudo === "documento" && itemAtual.midia && (
        <iframe
          key={itemAtual.id}
          className={styles.midia}
          src={itemAtual.midia.url}
          title="Documento"
        />
      )}

      {itemAtual.tipoConteudo === "pagina_web" && itemAtual.urlPaginaWeb && (
        <iframe
          key={itemAtual.id}
          className={styles.midia}
          src={itemAtual.urlPaginaWeb}
          title="Página web"
        />
      )}
    </main>
  );
}
