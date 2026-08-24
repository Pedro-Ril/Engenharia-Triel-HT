import type {
  CategoriaChamado,
  Chamado,
  ChamadoMensagem,
  ChamadosAtendente,
  ChamadoResumo,
  EstatisticasChamados,
  PrioridadeChamado,
  SetorAceiteChamados,
  StatusChamado,
} from "../types/chamados.types";

interface ApiEnvelope<T> {
  ok: boolean;
  message?: string;
  data?: T;
}

async function parseResponse<T>(response: Response): Promise<ApiEnvelope<T>> {
  return response.json();
}

export async function abrirChamado(
  formData: FormData
): Promise<ApiEnvelope<{ numero: number }>> {
  const response = await fetch("/api/chamados", {
    method: "POST",
    body: formData,
  });
  return parseResponse(response);
}

export async function buscarChamado(
  numero: number,
  nome?: string
): Promise<ApiEnvelope<Chamado>> {
  const query = nome ? `?nome=${encodeURIComponent(nome)}` : "";
  const response = await fetch(`/api/chamados/${numero}${query}`);
  return parseResponse(response);
}

export async function enviarMensagemChamado(
  numero: number,
  formData: FormData
): Promise<ApiEnvelope<ChamadoMensagem>> {
  const response = await fetch(`/api/chamados/${numero}/mensagens`, {
    method: "POST",
    body: formData,
  });
  return parseResponse(response);
}

export async function atualizarChamado(
  numero: number,
  dados: {
    prioridade?: PrioridadeChamado;
    atendenteUsuarioId?: string | null;
    publico?: boolean;
  }
): Promise<ApiEnvelope<Chamado>> {
  const response = await fetch(`/api/chamados/${numero}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  return parseResponse(response);
}

/*
 * Ações de fluxo (aceitar/resolver/confirmar/reabrir/fechar) —
 * ver db/schema/0013_chamados_fluxo_aceite.sql. `nome` só é
 * necessário quando quem age é o solicitante de um chamado
 * aberto sem login (mesma confirmação usada em /chamados/consultar).
 */
async function postAcaoChamado(
  numero: number,
  acao: "aceitar" | "marcar-resolvido" | "confirmar-resolucao" | "reabrir" | "fechar",
  nome?: string | null
): Promise<ApiEnvelope<Chamado>> {
  const response = await fetch(`/api/chamados/${numero}/${acao}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nome: nome ?? undefined }),
  });
  return parseResponse(response);
}

export function aceitarChamado(numero: number, nome?: string | null) {
  return postAcaoChamado(numero, "aceitar", nome);
}

export function marcarChamadoComoResolvido(numero: number, nome?: string | null) {
  return postAcaoChamado(numero, "marcar-resolvido", nome);
}

export function confirmarResolucaoChamado(numero: number, nome?: string | null) {
  return postAcaoChamado(numero, "confirmar-resolucao", nome);
}

export function reabrirChamado(numero: number, nome?: string | null) {
  return postAcaoChamado(numero, "reabrir", nome);
}

export function fecharChamado(numero: number, nome?: string | null) {
  return postAcaoChamado(numero, "fechar", nome);
}

export async function transferirChamado(
  numero: number,
  dados: { setorId: string; atendenteUsuarioId: string | null }
): Promise<ApiEnvelope<Chamado>> {
  const response = await fetch(`/api/chamados/${numero}/transferir`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  return parseResponse(response);
}

export async function listarAtendentesDoSetor(setorId: string): Promise<ChamadosAtendente[]> {
  const response = await fetch(`/api/chamados/atendentes?setorId=${encodeURIComponent(setorId)}`);
  const body = await parseResponse<ChamadosAtendente[]>(response);
  return body.data ?? [];
}

/*
 * Busca por título/descrição usada em /chamados/consultar — sem
 * sessão só traz chamados marcados como públicos; logado, também
 * traz os do próprio usuário (ver pesquisarChamados no backend).
 */
export async function pesquisarChamados(
  termo: string
): Promise<ApiEnvelope<ChamadoResumo[]>> {
  const response = await fetch(`/api/chamados/pesquisar?q=${encodeURIComponent(termo)}`);
  return parseResponse(response);
}

export interface FilaAtendimentoData {
  itens: ChamadoResumo[];
  total: number;
  pagina: number;
  totalPaginas: number;
}

export async function listarFilaAtendimento(params: {
  status?: StatusChamado;
  prioridade?: PrioridadeChamado;
  busca?: string;
  setorId?: string;
  empresa?: string;
  departamento?: string;
  categoriaId?: string;
  pagina?: number;
  porPagina?: number;
}): Promise<ApiEnvelope<FilaAtendimentoData>> {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.prioridade) query.set("prioridade", params.prioridade);
  if (params.busca) query.set("busca", params.busca);
  if (params.setorId) query.set("setorId", params.setorId);
  if (params.empresa) query.set("empresa", params.empresa);
  if (params.departamento) query.set("departamento", params.departamento);
  if (params.categoriaId) query.set("categoriaId", params.categoriaId);
  if (params.pagina) query.set("pagina", String(params.pagina));
  if (params.porPagina) query.set("porPagina", String(params.porPagina));

  const response = await fetch(`/api/chamados/fila?${query.toString()}`);
  return parseResponse(response);
}

export async function buscarEstatisticasChamados(params: {
  setorId?: string;
  empresa?: string;
  departamento?: string;
  categoriaId?: string;
  dataInicial?: string;
  dataFinal?: string;
}): Promise<ApiEnvelope<EstatisticasChamados>> {
  const query = new URLSearchParams();
  if (params.setorId) query.set("setorId", params.setorId);
  if (params.empresa) query.set("empresa", params.empresa);
  if (params.departamento) query.set("departamento", params.departamento);
  if (params.categoriaId) query.set("categoriaId", params.categoriaId);
  if (params.dataInicial) query.set("dataInicial", params.dataInicial);
  if (params.dataFinal) query.set("dataFinal", params.dataFinal);

  const response = await fetch(`/api/chamados/dashboard?${query.toString()}`);
  return parseResponse(response);
}

/* =========================================================
   ADMIN — atendentes de chamados
   ========================================================= */

export async function listarAtendentesChamados(): Promise<ChamadosAtendente[]> {
  const response = await fetch("/api/admin/chamados/atendentes");
  const body = await parseResponse<ChamadosAtendente[]>(response);
  return body.data ?? [];
}

export async function adicionarAtendenteChamados(dados: {
  usuarioId: string;
  setorId: string;
}): Promise<ApiEnvelope<ChamadosAtendente>> {
  const response = await fetch("/api/admin/chamados/atendentes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  return parseResponse(response);
}

export async function removerAtendenteChamados(id: string): Promise<ApiEnvelope<null>> {
  const response = await fetch(`/api/admin/chamados/atendentes/${id}`, {
    method: "DELETE",
  });
  return parseResponse(response);
}

export async function listarSetoresAceiteChamados(): Promise<SetorAceiteChamados[]> {
  const response = await fetch("/api/admin/chamados/setores");
  const body = await parseResponse<SetorAceiteChamados[]>(response);
  return body.data ?? [];
}

export async function atualizarAceiteChamadosSetor(
  setorId: string,
  aceitaChamados: boolean
): Promise<ApiEnvelope<null>> {
  const response = await fetch(`/api/admin/chamados/setores/${setorId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ aceitaChamados }),
  });
  return parseResponse(response);
}

/* =========================================================
   ADMIN — categorias de chamados
   ========================================================= */

export async function listarCategoriasChamados(): Promise<CategoriaChamado[]> {
  const response = await fetch("/api/admin/chamados/categorias");
  const body = await parseResponse<CategoriaChamado[]>(response);
  return body.data ?? [];
}

export async function criarCategoriaChamados(dados: {
  setorId: string;
  nome: string;
  ordem: number;
}): Promise<ApiEnvelope<CategoriaChamado>> {
  const response = await fetch("/api/admin/chamados/categorias", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  return parseResponse(response);
}

export async function atualizarCategoriaChamados(
  id: string,
  dados: { nome?: string; ordem?: number; ativo?: boolean }
): Promise<ApiEnvelope<CategoriaChamado>> {
  const response = await fetch(`/api/admin/chamados/categorias/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  return parseResponse(response);
}

export async function excluirCategoriaChamados(id: string): Promise<ApiEnvelope<null>> {
  const response = await fetch(`/api/admin/chamados/categorias/${id}`, {
    method: "DELETE",
  });
  return parseResponse(response);
}
