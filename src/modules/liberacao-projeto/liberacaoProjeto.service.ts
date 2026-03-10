import type {
  ClienteItem,
  EmailPayload,
  NomeItem,
  ApiErrorResponse,
} from "./liberacaoProjeto.types";

const API_BASE_URL = "http://192.168.0.250:3100";

async function handleResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type");

  if (!response.ok) {
    let errorMessage = `Erro HTTP ${response.status}`;

    if (contentType?.includes("application/json")) {
      const errorData: ApiErrorResponse = await response.json();
      errorMessage = errorData.error || errorMessage;
    } else {
      const text = await response.text();
      if (text) errorMessage = text;
    }

    throw new Error(errorMessage);
  }

  if (contentType?.includes("application/json")) {
    return response.json();
  }

  throw new Error("A API não retornou JSON válido.");
}

export async function buscarNomes(): Promise<NomeItem[]> {
  const response = await fetch(`${API_BASE_URL}/api/names`, {
    method: "GET",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
  });

  const data = await handleResponse<NomeItem[]>(response);

  if (!Array.isArray(data)) {
    throw new Error("Resposta inválida em /api/names.");
  }

  return data;
}

export async function buscarClientes(): Promise<ClienteItem[]> {
  const response = await fetch(`${API_BASE_URL}/api/clientes`, {
    method: "GET",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
  });

  const data = await handleResponse<ClienteItem[]>(response);

  if (!Array.isArray(data)) {
    throw new Error("Resposta inválida em /api/clientes.");
  }

  return data;
}

export async function enviarEmail(payload: EmailPayload): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/send-email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  await handleResponse(response);
}