import "server-only";

import { buscarConfigSemaforo } from "./config";

const API_URL_PADRAO = "http://127.0.0.1:9997";
const WHEP_BASE_URL_PADRAO = "http://127.0.0.1:8889";

async function apiBaseUrl(): Promise<string> {
  const config = await buscarConfigSemaforo();
  return config.mediamtxApiUrl || process.env.MEDIAMTX_API_URL || API_URL_PADRAO;
}

async function whepBaseUrl(): Promise<string> {
  const config = await buscarConfigSemaforo();
  return config.mediamtxWhepBaseUrl || process.env.MEDIAMTX_WHEP_BASE_URL || WHEP_BASE_URL_PADRAO;
}

/* Única fonte de verdade da fórmula da URL WHEP -- usada tanto pela rota pública (câmeras ativas) quanto pelo preview de teste no admin (path temporário, antes de salvar). */
export async function montarWhepUrl(mediamtxPath: string): Promise<string> {
  const base = await whepBaseUrl();
  return `${base}/${mediamtxPath}/whep`;
}

/* Injeta usuário/senha na URL RTSP em tempo de execução -- nunca ficam persistidas junto do stream_uri_rtsp cacheado. */
function montarSourceComCredenciais(streamUriRtsp: string, usuario: string, senha: string): string {
  const url = new URL(streamUriRtsp);
  url.username = encodeURIComponent(usuario);
  url.password = encodeURIComponent(senha);
  return url.toString();
}

/*
 * Registra (ou atualiza, via upsert) uma câmera como path no MediaMTX --
 * sourceOnDemand:true faz o MediaMTX só puxar RTSP da câmera de verdade
 * quando alguém abrir o menu flutuante e conectar via WHEP, em vez de
 * manter a câmera ligada o tempo todo sem ninguém assistindo.
 */
export async function registrarCameraNoMediaMtx(params: {
  mediamtxPath: string;
  streamUriRtsp: string;
  usuario: string;
  senha: string;
}): Promise<void> {
  const base = await apiBaseUrl();
  const source = montarSourceComCredenciais(params.streamUriRtsp, params.usuario, params.senha);

  const corpo = JSON.stringify({
    source,
    sourceOnDemand: true,
    rtspTransport: "tcp",
  });

  const respostaPatch = await fetch(`${base}/v3/config/paths/patch/${params.mediamtxPath}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: corpo,
  }).catch(() => null);

  if (respostaPatch?.ok) return;

  await fetch(`${base}/v3/config/paths/add/${params.mediamtxPath}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: corpo,
  });
}

export async function removerCameraDoMediaMtx(mediamtxPath: string): Promise<void> {
  const base = await apiBaseUrl();

  /* Best-effort -- não impede a exclusão da câmera no banco se o MediaMTX estiver fora do ar. */
  await fetch(`${base}/v3/config/paths/delete/${mediamtxPath}`, { method: "DELETE" }).catch(() => {});
}
