import type { MinhaContaData } from "../types/minhaConta.types";

export type ResultadoMinhaConta =
  | { ok: true; data: MinhaContaData }
  | { ok: false; motivo: "sessao_expirada" | "erro" };

export async function buscarMinhaConta(): Promise<ResultadoMinhaConta> {
  try {
    const response = await fetch("/api/minha-conta");

    if (response.status === 401) {
      return { ok: false, motivo: "sessao_expirada" };
    }

    const body: { ok: boolean; data?: MinhaContaData } = await response.json();

    return body.ok && body.data ? { ok: true, data: body.data } : { ok: false, motivo: "erro" };
  } catch {
    return { ok: false, motivo: "erro" };
  }
}
