import type {
  DeParaMateriaPrima,
  ItensMateriaPrimaData,
} from "../types/deparaMateriaPrima.types";

interface ApiEnvelope<T> {
  ok: boolean;
  message?: string;
  data?: T;
}

async function parseResponse<T>(response: Response): Promise<ApiEnvelope<T>> {
  return response.json();
}

export async function buscarItensMateriaPrima(): Promise<ApiEnvelope<ItensMateriaPrimaData>> {
  const response = await fetch("/api/materias-primas/itens");
  return parseResponse<ItensMateriaPrimaData>(response);
}

export async function listarDeParas(): Promise<DeParaMateriaPrima[]> {
  const response = await fetch("/api/depara-materia-prima");
  const body = await parseResponse<DeParaMateriaPrima[]>(response);
  return body.data ?? [];
}

export async function criarDePara(dados: {
  codItemOrigem: string;
  descItemOrigem: string | null;
  codItemDestino: string;
  descItemDestino: string | null;
  observacao: string;
}): Promise<ApiEnvelope<DeParaMateriaPrima>> {
  const response = await fetch("/api/depara-materia-prima", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  return parseResponse<DeParaMateriaPrima>(response);
}

export async function atualizarAtivoDePara(
  id: string,
  ativo: boolean
): Promise<ApiEnvelope<DeParaMateriaPrima>> {
  const response = await fetch(`/api/depara-materia-prima/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ativo }),
  });
  return parseResponse<DeParaMateriaPrima>(response);
}

export async function excluirDePara(id: string): Promise<ApiEnvelope<null>> {
  const response = await fetch(`/api/depara-materia-prima/${id}`, {
    method: "DELETE",
  });
  return parseResponse<null>(response);
}
