/* Espelha src/lib/3dexperience/liberacao-desenhos.ts (lado do navegador). */

export type StatusRodada =
  | "agendada"
  | "explodindo"
  | "buscando_desenhos"
  | "processando"
  | "concluida"
  | "erro"
  | "cancelada";
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
  /* Usuário com que o 3DX executou a liberação real (null: simulação, ou liberação antiga feita com o admin). */
  executadoComo: string | null;
  criadoEm: string;
  finalizadoEm: string | null;
  liberacaoId: string | null;
  /* Fluxo agendado: simula e libera sozinho depois da espera, avisa por e-mail. */
  automatica: boolean;
  agendadaPara: string | null;
  /* Segundos que faltam para começar (relógio do servidor), só enquanto 'agendada'. */
  segundosParaInicio: number | null;
  /* Quando o e-mail final saiu (o fluxo agendado terminou). */
  notificadoEm: string | null;
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

export async function liberarSimulacao(id: string, desenhos: string[], senha: string | null): Promise<ApiEnvelope<{ id: string }>> {
  const response = await fetch(`/api/3dexperience/liberacao/${id}/liberar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ desenhos, senha }),
  });
  return parseResponse(response);
}

export async function agendarLiberacao(
  codigo: string,
  senha: string | null
): Promise<ApiEnvelope<{ id: string; minutos: number; semEmail: boolean }>> {
  const response = await fetch("/api/3dexperience/liberacao/agendar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ codigo, senha }),
  });
  return parseResponse(response);
}

export async function cancelarAgendamento(id: string): Promise<ApiEnvelope<unknown>> {
  const response = await fetch(`/api/3dexperience/liberacao/${id}/cancelar`, { method: "POST" });
  return parseResponse(response);
}

export type TipoRodada = "todas" | "simulacao" | "liberacao";

export async function listarRodadas(params: {
  pagina: number;
  porPagina: number;
  codigo: string;
  tipo: TipoRodada;
}): Promise<ApiEnvelope<{ itens: Rodada[]; total: number }>> {
  const busca = new URLSearchParams({ pagina: String(params.pagina), porPagina: String(params.porPagina), tipo: params.tipo });
  if (params.codigo) busca.set("codigo", params.codigo);
  const response = await fetch(`/api/3dexperience/liberacao?${busca.toString()}`, { cache: "no-store" });
  return parseResponse(response);
}
