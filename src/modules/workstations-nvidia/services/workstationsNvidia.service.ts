import type {
  ConfiguracaoNvidia,
  MaquinaNvidia,
  PaginaEventosNvidia,
  PerfilOficialNvidia,
  ResultadoColetaNvidia,
  ResumoMaquinasNvidia,
} from "../types/workstationsNvidia.types";

export interface ApiEnvelope<T> {
  ok: boolean;
  message?: string;
  data?: T;
}

const BASE = "/api/admin/workstations-nvidia";

async function parseResponse<T>(response: Response): Promise<ApiEnvelope<T>> {
  try {
    return await response.json();
  } catch {
    return { ok: false, message: "Resposta inválida do servidor." };
  }
}

async function chamar<T>(caminho: string, init?: RequestInit): Promise<ApiEnvelope<T>> {
  try {
    const response = await fetch(`${BASE}${caminho}`, init);
    return await parseResponse<T>(response);
  } catch {
    return { ok: false, message: "Não foi possível falar com o servidor." };
  }
}

function json(method: string, corpo: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  };
}

export function buscarResumoMaquinas() {
  return chamar<ResumoMaquinasNvidia>("/maquinas");
}

export function adicionarMaquinas(computadores: string) {
  return chamar<{ adicionadas: string[]; jaExistiam: string[] }>(
    "/maquinas",
    json("POST", { computadores })
  );
}

export function atualizarMaquina(id: string, dados: { ativo?: boolean; descricao?: string | null }) {
  return chamar<MaquinaNvidia>(`/maquinas/${id}`, json("PATCH", dados));
}

export function excluirMaquina(id: string) {
  return chamar<null>(`/maquinas/${id}`, { method: "DELETE" });
}

export function coletarAgora(maquinaId?: string) {
  return chamar<ResultadoColetaNvidia>("/coletar", json("POST", maquinaId ? { maquinaId } : {}));
}

export function listarEventos(params: { maquinaId?: string | null; pagina: number }) {
  const busca = new URLSearchParams({ pagina: String(params.pagina) });
  if (params.maquinaId) busca.set("maquinaId", params.maquinaId);
  return chamar<PaginaEventosNvidia>(`/eventos?${busca.toString()}`);
}

export function buscarConfiguracao() {
  return chamar<ConfiguracaoNvidia>("/config");
}

export function salvarConfiguracao(
  dados: Omit<ConfiguracaoNvidia, "atualizadoEm" | "atualizadoPor">
) {
  return chamar<ConfiguracaoNvidia>("/config", json("PUT", dados));
}

export function buscarPerfilOficial() {
  return chamar<PerfilOficialNvidia>("/perfil");
}

export function publicarPerfilOficial(arquivo: File) {
  const formData = new FormData();
  formData.append("arquivo", arquivo);
  return chamar<PerfilOficialNvidia>("/perfil", { method: "POST", body: formData });
}

export const URL_DOWNLOAD_SCRIPT = `${BASE}/script`;
