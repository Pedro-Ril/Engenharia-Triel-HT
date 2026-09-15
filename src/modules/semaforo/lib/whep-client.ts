/*
 * Cliente WHEP (WebRTC-HTTP Egress Protocol) feito à mão -- o
 * MediaMTX serve WHEP nativamente, então não precisa de nenhuma lib
 * de player: só um RTCPeerConnection recvonly + um POST do SDP offer,
 * igual ao fluxo documentado em https://github.com/bluenviron/mediamtx
 * ("WebRTC" / "Reading a stream from the browser").
 */
export interface SessaoWhep {
  peerConnection: RTCPeerConnection;
  encerrar: () => Promise<void>;
}

export async function conectarWhep(whepUrl: string, videoElement: HTMLVideoElement): Promise<SessaoWhep> {
  const peerConnection = new RTCPeerConnection();

  peerConnection.addTransceiver("video", { direction: "recvonly" });
  peerConnection.addTransceiver("audio", { direction: "recvonly" });

  peerConnection.ontrack = (event) => {
    if (videoElement.srcObject !== event.streams[0]) {
      videoElement.srcObject = event.streams[0];
    }
  };

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  await aguardarIceGatheringCompleto(peerConnection);

  const sdpOferta = peerConnection.localDescription?.sdp ?? offer.sdp ?? "";

  let response: Response;
  try {
    response = await fetch(whepUrl, {
      method: "POST",
      headers: { "Content-Type": "application/sdp" },
      body: sdpOferta,
    });
  } catch (error) {
    peerConnection.close();
    throw error instanceof Error ? error : new Error("Falha ao conectar à câmera.");
  }

  if (!response.ok) {
    peerConnection.close();
    throw new Error(`A câmera não respondeu (HTTP ${response.status}).`);
  }

  const sdpResposta = await response.text();
  const localizacaoRecurso = response.headers.get("Location");
  const urlRecurso = localizacaoRecurso ? new URL(localizacaoRecurso, whepUrl).toString() : null;

  await peerConnection.setRemoteDescription({ type: "answer", sdp: sdpResposta });

  return {
    peerConnection,
    encerrar: async () => {
      peerConnection.close();
      if (urlRecurso) {
        await fetch(urlRecurso, { method: "DELETE" }).catch(() => {});
      }
    },
  };
}

/* Sem "trickle ICE" -- espera o gathering terminar (ou 3s, o que vier primeiro) antes de mandar o offer, como um POST único do WHEP exige. */
function aguardarIceGatheringCompleto(peerConnection: RTCPeerConnection): Promise<void> {
  if (peerConnection.iceGatheringState === "complete") {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const limite = setTimeout(finalizar, 3000);

    function finalizar() {
      clearTimeout(limite);
      peerConnection.removeEventListener("icegatheringstatechange", verificar);
      resolve();
    }

    function verificar() {
      if (peerConnection.iceGatheringState === "complete") {
        finalizar();
      }
    }

    peerConnection.addEventListener("icegatheringstatechange", verificar);
  });
}
