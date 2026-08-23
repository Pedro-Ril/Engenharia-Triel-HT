import type { DownloadPublico } from "../types/downloads.types";

export async function buscarDownloads(): Promise<DownloadPublico[] | null> {
  try {
    const response = await fetch("/api/downloads");
    const body: { ok: boolean; data?: DownloadPublico[] } = await response.json();

    return body.ok && body.data ? body.data : [];
  } catch {
    return null;
  }
}
