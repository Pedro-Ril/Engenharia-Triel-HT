import type {
  AprovacaoLote,
  DetalheAtualFuncionario,
  FuncionarioRh,
  ItemAumentoSalarial,
  StatusAprovacao,
  TipoAprovacao,
} from "../types/aprovacoes.types";

interface ApiEnvelope<T> {
  ok: boolean;
  message?: string;
  data?: T;
}

async function parseResponse<T>(response: Response): Promise<ApiEnvelope<T>> {
  return response.json();
}

export async function buscarFuncionariosRh(): Promise<ApiEnvelope<FuncionarioRh[]>> {
  const response = await fetch("/api/aprovacoes/rh/funcionarios");
  return parseResponse(response);
}

export async function buscarSalarioFuncionario(codigo: string): Promise<ApiEnvelope<DetalheAtualFuncionario>> {
  const response = await fetch(`/api/aprovacoes/rh/funcionarios/${encodeURIComponent(codigo)}/salario`);
  return parseResponse(response);
}

export interface ItemCriarSolicitacaoPayload {
  funcionarioCodigo: string;
  funcionarioNome: string;
  funcionarioCpf: string | null;
  departamento: string | null;
  setor: string | null;
  salarioAtual: number;
  valorReajuste: number;
  percentualReajuste: number;
  observacao: string | null;
}

export interface CriarSolicitacaoAumentoPayload {
  observacao: string | null;
  itens: ItemCriarSolicitacaoPayload[];
}

export async function criarSolicitacaoAumento(
  payload: CriarSolicitacaoAumentoPayload
): Promise<ApiEnvelope<AprovacaoLote>> {
  const response = await fetch("/api/aprovacoes/aumento-salarial", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseResponse(response);
}

/* Uma linha por colaborador -- não por lote, já que cada um é decidido individualmente. */
export async function listarMinhasSolicitacoes(): Promise<ApiEnvelope<ItemAumentoSalarial[]>> {
  const response = await fetch("/api/aprovacoes/minhas");
  return parseResponse(response);
}

export type OrdemPainel = "fila" | "colaborador" | "recentes";

export interface FiltrosPainel {
  status: StatusAprovacao | "todos";
  busca: string;
  departamento: string;
  setor: string;
  /* Vazio = todos os tipos que a pessoa atende. */
  tipo: string;
  ordem: OrdemPainel;
}

/* `tiposAtendidos` vazio = o usuário abre a tela mas ainda não é aprovador de nenhum tipo (é o que diferencia "fila vazia" de "sem cadastro"). */
export type ModoPainel = "colaborador" | "solicitacao";

/* Resumo por solicitação, com contagens sobre o lote INTEIRO (o filtro decide quais aparecem, não o que é somado). */
export interface SolicitacaoResumoPainel {
  numero: number;
  tipo: TipoAprovacao;
  criadoPorNome: string;
  criadoEm: string;
  totalItens: number;
  totalReajuste: number;
  pendentes: number;
}

export interface RespostaPainel {
  itens: ItemAumentoSalarial[];
  solicitacoes: SolicitacaoResumoPainel[];
  tiposAtendidos: TipoAprovacao[];
  /* Pendências por tipo, ignorando os filtros -- alimenta o contador das abas. */
  pendentesPorTipo: Record<string, number>;
  /* Com o que a tela abre, definido pelo admin -- o usuário pode trocar depois. */
  modoPadrao: ModoPainel;
  /* Valores que existem na fila de quem está olhando -- alimentam os dropdowns. */
  departamentos: string[];
  setores: string[];
}

export async function listarItensPainel(filtros: FiltrosPainel): Promise<ApiEnvelope<RespostaPainel>> {
  const parametros = new URLSearchParams({
    status: filtros.status,
    busca: filtros.busca,
    departamento: filtros.departamento,
    setor: filtros.setor,
    tipo: filtros.tipo,
    ordem: filtros.ordem,
  });
  const response = await fetch(`/api/aprovacoes/painel?${parametros.toString()}`);
  return parseResponse(response);
}

export async function buscarItemAprovacao(itemId: string): Promise<ApiEnvelope<ItemAumentoSalarial>> {
  const response = await fetch(`/api/aprovacoes/itens/${itemId}`);
  return parseResponse(response);
}

/* `ajuste` só vai quando a direção mexeu no valor/percentual -- ausente significa decidir com o que o solicitante pediu. */
export interface AjusteValoresDecisao {
  valorReajuste: number;
  percentualReajuste: number;
}

export async function aprovarItemAprovacao(
  itemId: string,
  comentario: string | null,
  ajuste: AjusteValoresDecisao | null = null
): Promise<ApiEnvelope<ItemAumentoSalarial>> {
  const response = await fetch(`/api/aprovacoes/itens/${itemId}/aprovar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ comentario, ajuste }),
  });
  return parseResponse(response);
}

export async function reprovarItemAprovacao(
  itemId: string,
  comentario: string,
  ajuste: AjusteValoresDecisao | null = null
): Promise<ApiEnvelope<ItemAumentoSalarial>> {
  const response = await fetch(`/api/aprovacoes/itens/${itemId}/reprovar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ comentario, ajuste }),
  });
  return parseResponse(response);
}

export interface ResultadoDecisaoLote {
  decididos: number;
  falhas: { itemId: string; motivo: string }[];
}

/* Decide a seleção inteira de uma vez no painel. Sem ajuste de valores: isso é conferência individual. */
export async function decidirItensEmLote(
  itemIds: string[],
  acao: "aprovar" | "reprovar",
  comentario: string | null
): Promise<ApiEnvelope<ResultadoDecisaoLote>> {
  const response = await fetch("/api/aprovacoes/itens/lote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemIds, acao, comentario }),
  });
  return parseResponse(response);
}

/* Relatório dos colaboradores APROVADOS, enviado para o e-mail configurado na administração. */
export async function enviarRelatorioSolicitacao(numero: number): Promise<ApiEnvelope<null>> {
  const response = await fetch(`/api/aprovacoes/${numero}/relatorio`, { method: "POST" });
  return parseResponse(response);
}

/* A solicitação inteira, com todos os colaboradores -- usada pelo modo agrupado do painel. */
export async function buscarLoteAprovacao(numero: number): Promise<ApiEnvelope<AprovacaoLote>> {
  const response = await fetch(`/api/aprovacoes/${numero}`);
  return parseResponse(response);
}
