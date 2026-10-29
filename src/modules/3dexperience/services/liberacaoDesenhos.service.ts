/* Espelha src/lib/3dexperience/liberacao-desenhos.ts (lado do navegador). */

export type StatusRodada = "explodindo" | "buscando_desenhos" | "processando" | "concluida" | "erro";
export type AcaoDesenho = "pendente" | "seria_liberado" | "liberado" | "ja_liberado" | "ignorado" | "erro";

export interface Rodada {
  id: string;
  codigoPai: string;
  dryRun: boolean;
  simulacaoId: string | null;
  status: StatusRodada;
  totalItens: number | null;
  totalDesenhos: number | null;
  totalEmTrabalho: number | null;
  totalLiberados: number | null;
  totalErros: number | null;
  mensagem: string | null;
  usuarioNome: string;
  criadoEm: string;
  finalizadoEm: string | null;
  liberacaoId: string | null;
}

export interface DesenhoDaRodada {
  ordem: number;
  itemCodigo: string | null;
  itemRevisao: string | null;
  itemStatus: string | null;
  itemNivel: number | null;
  desenhoPhysicalId: string;
  desenhoTitulo: string | null;
  desenhoRevisao: string | null;
  statusAntes: string | null;
  acao: AcaoDesenho;
  mensagem: string | null;
}

interface ApiEnvelope<T> {
  ok: boolean;
  message?: string;
  data?: T;
}

async function parseResponse<T>(response: Response): Promise<ApiEnvelope<T>> {
  const json = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!json) return { ok: false, message: `Resposta inválida do servidor (HTTP ${response.status}).` };
  return json;
}

export async function iniciarSimulacao(codigo: string): Promise<ApiEnvelope<{ id: string }>> {
  const response = await fetch("/api/3dexperience/liberacao", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ codigo }),
  });
  return parseResponse(response);
}

export async function buscarRodada(id: string): Promise<ApiEnvelope<{ rodada: Rodada; desenhos: DesenhoDaRodada[] }>> {
  const response = await fetch(`/api/3dexperience/liberacao/${id}`, { cache: "no-store" });
  return parseResponse(response);
}

export async function liberarSimulacao(id: string, desenhos: string[]): Promise<ApiEnvelope<{ id: string }>> {
  const response = await fetch(`/api/3dexperience/liberacao/${id}/liberar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ desenhos }),
  });
  return parseResponse(response);
}

export async function listarRodadas(): Promise<ApiEnvelope<Rodada[]>> {
  const response = await fetch("/api/3dexperience/liberacao", { cache: "no-store" });
  return parseResponse(response);
}
