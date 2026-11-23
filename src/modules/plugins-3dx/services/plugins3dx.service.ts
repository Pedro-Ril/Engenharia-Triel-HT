import type {
  AcaoManual3dx,
  Ambiente3dx,
  Destinatario3dx,
  DetalheExecucao3dx,
  FiltrosExecucoes3dx,
  ModoPlugin3dx,
  NovoDestinatario3dx,
  PaginaExecucoes3dx,
  VerificacaoAmbiente3dx,
  Versao3dx,
  VisaoGeralPlugins3dx,
} from "../types/plugins3dx.types";

export interface ApiEnvelope<T> {
  ok: boolean;
  message?: string;
  data?: T;
}

const BASE = "/api/admin/plugins-3dx";

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
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) };
}

/* Sem ambiente = os dois. */
export function buscarVisaoGeral(ambiente?: Ambiente3dx | null) {
  return chamar<VisaoGeralPlugins3dx>(ambiente ? `?ambiente=${ambiente}` : "");
}

export function salvarPlugin(
  chave: string,
  dados: { ambiente: Ambiente3dx; modo?: ModoPlugin3dx; parametros?: Record<string, unknown> }
) {
  return chamar<null>(`/plugins/${encodeURIComponent(chave)}`, json("PUT", dados));
}

export function listarExecucoes(filtros: FiltrosExecucoes3dx) {
  const busca = new URLSearchParams({ pagina: String(filtros.pagina) });
  if (filtros.ambiente) busca.set("ambiente", filtros.ambiente);
  if (filtros.plugin) busca.set("plugin", filtros.plugin);
  if (filtros.status) busca.set("status", filtros.status);
  if (filtros.gatilho) busca.set("gatilho", filtros.gatilho);
  if (filtros.busca) busca.set("busca", filtros.busca);
  if (filtros.de) busca.set("de", filtros.de);
  if (filtros.ate) busca.set("ate", filtros.ate);
  return chamar<PaginaExecucoes3dx>(`/execucoes?${busca.toString()}`);
}

export function buscarExecucao(id: string) {
  return chamar<DetalheExecucao3dx>(`/execucoes/${id}`);
}

export function cancelarExecucao(id: string) {
  return chamar<null>(`/execucoes/${id}`, json("PATCH", { acao: "cancelar" }));
}

export function enviarAcao(acao: AcaoManual3dx) {
  return chamar<{ id: string }>("/acoes", json("POST", acao));
}

export function listarDestinatarios() {
  return chamar<Destinatario3dx[]>("/destinatarios");
}

export function adicionarDestinatario(dados: NovoDestinatario3dx) {
  return chamar<null>("/destinatarios", json("POST", dados));
}

export function alternarDestinatario(id: string, ativo: boolean) {
  return chamar<null>(`/destinatarios/${id}`, json("PATCH", { ativo }));
}

export function removerDestinatario(id: string) {
  return chamar<null>(`/destinatarios/${id}`, { method: "DELETE" });
}

/* Notas de versão (todas, ou só de um componente: "core" ou a chave do plugin). */
export function listarVersoes(componente?: string | null) {
  return chamar<Versao3dx[]>(componente ? `/versoes?componente=${encodeURIComponent(componente)}` : "/versoes");
}

/* Verificação do ambiente 3DX (versão do 3DSpace e padrão de visualização em cada nó). */
export function buscarVerificacaoAmbiente() {
  return chamar<VerificacaoAmbiente3dx>("/ambiente");
}

/* Roda a verificação agora (com avisos, como o agendador) e devolve o estado novo. */
export function verificarAmbienteAgora() {
  return chamar<VerificacaoAmbiente3dx>("/ambiente", { method: "POST" });
}
