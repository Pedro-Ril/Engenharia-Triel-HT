import type { Camera, ConfigSemaforo, ResultadoTesteCamera } from "../types/semaforo.types";

export interface ApiEnvelope<T> {
  ok: boolean;
  message?: string;
  data?: T;
}

async function parseResponse<T>(response: Response): Promise<ApiEnvelope<T>> {
  return response.json();
}

/* Config (modo legado + MediaMTX) */

export async function buscarConfigSemaforoAdmin(): Promise<ConfigSemaforo | null> {
  try {
    const response = await fetch("/api/admin/semaforo/config");
    const body = await parseResponse<ConfigSemaforo>(response);
    return body.ok && body.data ? body.data : null;
  } catch {
    return null;
  }
}

export async function salvarConfigSemaforoAdmin(dados: {
  modoLegado: boolean;
  mediamtxApiUrl: string | null;
  mediamtxWhepBaseUrl: string | null;
}): Promise<ApiEnvelope<ConfigSemaforo>> {
  const response = await fetch("/api/admin/semaforo/config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  return parseResponse(response);
}

export async function buscarStatusMediamtx(): Promise<ApiEnvelope<{ online: boolean }>> {
  const response = await fetch("/api/admin/semaforo/mediamtx/status");
  return parseResponse(response);
}

export async function iniciarMediamtx(): Promise<ApiEnvelope<{ online: boolean }>> {
  const response = await fetch("/api/admin/semaforo/mediamtx/iniciar", { method: "POST" });
  return parseResponse(response);
}

/* Câmeras */

export async function listarCamerasAdmin(): Promise<Camera[]> {
  try {
    const response = await fetch("/api/admin/semaforo/cameras");
    const body = await parseResponse<Camera[]>(response);
    return body.ok && body.data ? body.data : [];
  } catch {
    return [];
  }
}

export async function criarCameraAdmin(dados: {
  nome: string;
  host: string;
  portaOnvif: number;
  usuario: string;
  senha: string;
}): Promise<ApiEnvelope<Camera>> {
  const response = await fetch("/api/admin/semaforo/cameras", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  return parseResponse(response);
}

export async function atualizarCameraAdmin(
  id: string,
  dados: {
    nome?: string;
    host?: string;
    portaOnvif?: number;
    usuario?: string;
    senha?: string | null;
    ativo?: boolean;
    ordem?: number;
  }
): Promise<ApiEnvelope<Camera>> {
  const response = await fetch(`/api/admin/semaforo/cameras/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  return parseResponse(response);
}

export async function excluirCameraAdmin(id: string): Promise<ApiEnvelope<null>> {
  const response = await fetch(`/api/admin/semaforo/cameras/${id}`, { method: "DELETE" });
  return parseResponse(response);
}

export async function testarConexaoCameraAdmin(dados: {
  host: string;
  portaOnvif: number;
  usuario: string;
  senha: string;
}): Promise<ApiEnvelope<ResultadoTesteCamera>> {
  const response = await fetch("/api/admin/semaforo/cameras/testar-conexao", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  return parseResponse(response);
}

export async function reverificarCameraAdmin(id: string): Promise<ApiEnvelope<ResultadoTesteCamera>> {
  const response = await fetch(`/api/admin/semaforo/cameras/${id}/testar-conexao`, { method: "POST" });
  return parseResponse(response);
}
