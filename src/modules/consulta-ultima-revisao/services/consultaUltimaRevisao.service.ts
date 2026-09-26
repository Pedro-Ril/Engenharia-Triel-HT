import type { EstruturaUltimaRevisao } from "../types/consultaUltimaRevisao.types";

interface ApiEnvelope<T> {
  ok: boolean;
  message?: string;
  data?: T;
}

export async function buscarEstruturaUltimaRevisao(
  codigo: string
): Promise<ApiEnvelope<EstruturaUltimaRevisao>> {
  const response = await fetch(`/api/consulta-ultima-revisao/${encodeURIComponent(codigo)}`);
  return response.json();
}
