import type { MinhaContaData } from "../types/minhaConta.types";

export async function buscarMinhaConta(): Promise<MinhaContaData | null> {
  const response = await fetch("/api/minha-conta");
  const body: { ok: boolean; data?: MinhaContaData } = await response.json();

  return body.ok && body.data ? body.data : null;
}
