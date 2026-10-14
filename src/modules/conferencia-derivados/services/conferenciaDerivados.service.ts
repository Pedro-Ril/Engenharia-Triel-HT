import type { TipoArquivoDerivado } from "../constants/tipos-arquivo";
import type { ResultadoConferencia } from "../types/conferenciaDerivados.types";

interface ApiEnvelope<T> {
  ok: boolean;
  message?: string;
  data?: T;
}

async function parseResponse<T>(response: Response): Promise<ApiEnvelope<T>> {
  try {
    return await response.json();
  } catch {
    return { ok: false, message: `Resposta inválida do servidor (HTTP ${response.status}).` };
  }
}

export async function conferirArquivos(
  codigos: string[],
  tipos: TipoArquivoDerivado[]
): Promise<ApiEnvelope<ResultadoConferencia>> {
  try {
    const response = await fetch("/api/conferencia-derivados/conferir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigos, tipos }),
    });

    return parseResponse<ResultadoConferencia>(response);
  } catch {
    return { ok: false, message: "Não foi possível falar com o servidor." };
  }
}
