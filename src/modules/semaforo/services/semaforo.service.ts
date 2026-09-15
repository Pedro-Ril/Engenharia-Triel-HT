import type { CameraParaVisualizacao } from "../types/semaforo.types";

export interface ApiEnvelope<T> {
  ok: boolean;
  message?: string;
  data?: T;
}

async function parseResponse<T>(response: Response): Promise<ApiEnvelope<T>> {
  return response.json();
}

export async function listarCamerasParaVisualizacao(): Promise<CameraParaVisualizacao[]> {
  try {
    const response = await fetch("/api/semaforo/cameras", { cache: "no-store" });
    const body = await parseResponse<CameraParaVisualizacao[]>(response);
    return body.ok && body.data ? body.data : [];
  } catch {
    return [];
  }
}
