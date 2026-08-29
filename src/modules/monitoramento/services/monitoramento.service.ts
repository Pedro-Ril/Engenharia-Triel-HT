import type {
  LogSistema,
  NivelLog,
  ResultadoAtividade,
  ResumoApis,
  ResumoMonitoramento,
} from "../types/monitoramento.types";

interface ApiEnvelope<T> {
  ok: boolean;
  message?: string;
  data?: T;
}

async function parseResponse<T>(response: Response): Promise<ApiEnvelope<T>> {
  return response.json();
}

export async function buscarResumoMonitoramento(): Promise<ResumoMonitoramento | null> {
  try {
    const response = await fetch("/api/admin/monitoramento/resumo");
    const body = await parseResponse<ResumoMonitoramento>(response);
    return body.ok && body.data ? body.data : null;
  } catch {
    return null;
  }
}

export async function buscarAtividadeRecente(
  pagina: number,
  porPagina: number
): Promise<ResultadoAtividade | null> {
  const params = new URLSearchParams();
  params.set("pagina", String(pagina));
  params.set("porPagina", String(porPagina));

  try {
    const response = await fetch(`/api/admin/monitoramento/atividade?${params.toString()}`);
    const body = await parseResponse<ResultadoAtividade>(response);
    return body.ok && body.data ? body.data : null;
  } catch {
    return null;
  }
}

export interface FiltrosLogs {
  nivel?: NivelLog;
  origem?: string;
  busca?: string;
  pagina: number;
  porPagina: number;
}

export interface ResultadoLogs {
  itens: LogSistema[];
  total: number;
  origens: string[];
}

export async function buscarLogs(filtros: FiltrosLogs): Promise<ResultadoLogs | null> {
  const params = new URLSearchParams();
  if (filtros.nivel) params.set("nivel", filtros.nivel);
  if (filtros.origem) params.set("origem", filtros.origem);
  if (filtros.busca) params.set("busca", filtros.busca);
  params.set("pagina", String(filtros.pagina));
  params.set("porPagina", String(filtros.porPagina));

  try {
    const response = await fetch(`/api/admin/monitoramento/logs?${params.toString()}`);
    const body = await parseResponse<ResultadoLogs>(response);
    return body.ok && body.data ? body.data : null;
  } catch {
    return null;
  }
}

export async function limparLogsAntigos(dias: number): Promise<ApiEnvelope<{ removidos: number }>> {
  const response = await fetch("/api/admin/monitoramento/logs/limpar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dias }),
  });
  return parseResponse(response);
}

export async function buscarResumoApis(): Promise<ResumoApis | null> {
  try {
    const response = await fetch("/api/admin/monitoramento/apis");
    const body = await parseResponse<ResumoApis>(response);
    return body.ok && body.data ? body.data : null;
  } catch {
    return null;
  }
}

export async function limparRequisicoesAntigas(
  dias: number
): Promise<ApiEnvelope<{ removidos: number }>> {
  const response = await fetch("/api/admin/monitoramento/requisicoes/limpar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dias }),
  });
  return parseResponse(response);
}
