/* Espelha src/lib/engenharia-versatil (lado do navegador). */

export type TipoArquivo = "pdf" | "dxf";
export type SituacaoItem = "copiar" | "ja_existe" | "nao_encontrado";
export type AcaoItem = "copiado" | "ja_existia" | "nao_encontrado" | "erro";
export type MotivoAbaIgnorada = "blacklist" | "sem_cabecalho" | "sem_arquivos" | "nome_invalido";

export interface ItemPlano {
  aba: string;
  pastaDestino: string;
  codigo: string;
  tipo: TipoArquivo;
  arquivo: string | null;
  situacao: SituacaoItem;
}

export interface PastaPlano {
  caminho: string;
  existe: boolean;
  criar: boolean;
}

export interface PreviaSeparacao {
  numeroProjeto: string;
  arquivoPlanilha: string;
  pastaProjeto: string;
  plano: {
    itens: ItemPlano[];
    pastas: PastaPlano[];
    abasIgnoradas: { aba: string; motivo: MotivoAbaIgnorada; itens: number }[];
  };
  totais: { pastasCriar: number; copiar: number; jaExistem: number; naoEncontrados: number };
}

export interface Separacao {
  id: string;
  numeroProjeto: string;
  arquivoPlanilha: string;
  pastaProjeto: string | null;
  status: "executando" | "concluida" | "erro";
  pastasCriadas: number;
  arquivosCopiados: number;
  arquivosJaExistiam: number;
  arquivosNaoEncontrados: number;
  arquivosComErro: number;
  mensagem: string | null;
  usuarioNome: string;
  criadoEm: string;
  finalizadoEm: string | null;
}

export interface ItemSeparacao {
  ordem: number;
  aba: string;
  pastaDestino: string;
  codigo: string;
  tipo: TipoArquivo;
  arquivo: string | null;
  acao: AcaoItem;
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

function comPlanilha(planilha: File): FormData {
  const form = new FormData();
  form.append("planilha", planilha);
  return form;
}

export async function analisarPlanilha(planilha: File): Promise<ApiEnvelope<PreviaSeparacao>> {
  const response = await fetch("/api/engenharia-versatil/separacao/analisar", { method: "POST", body: comPlanilha(planilha) });
  return parseResponse(response);
}

export async function executarSeparacao(planilha: File): Promise<ApiEnvelope<{ id: string }>> {
  const response = await fetch("/api/engenharia-versatil/separacao", { method: "POST", body: comPlanilha(planilha) });
  return parseResponse(response);
}

export async function buscarSeparacao(id: string): Promise<ApiEnvelope<{ separacao: Separacao; itens: ItemSeparacao[] }>> {
  const response = await fetch(`/api/engenharia-versatil/separacao/${id}`, { cache: "no-store" });
  return parseResponse(response);
}

export async function listarSeparacoes(params: { pagina: number; porPagina: number }): Promise<ApiEnvelope<{ itens: Separacao[]; total: number }>> {
  const busca = new URLSearchParams({ pagina: String(params.pagina), porPagina: String(params.porPagina) });
  const response = await fetch(`/api/engenharia-versatil/separacao?${busca.toString()}`, { cache: "no-store" });
  return parseResponse(response);
}

/* ------------------------------------------------------------------ fator de conversão (KG) */

export type SituacaoFator =
  | "incluir"
  | "alterar"
  | "ok"
  | "peso_divergente"
  | "planilha_sem_peso"
  | "estoque_kg"
  | "sem_unidade"
  | "planilha_conflito"
  | "nao_encontrado";

export interface LinhaFator {
  codigo: string;
  aba: string;
  unidEstoque: string | null;
  pesoPlanilha: number | null;
  pesoErp: number | null;
  conversaoId: number | null;
  taxaAtual: number | null;
  situacao: SituacaoFator;
  operacao: "incluir" | "alterar" | null;
  taxaProposta: number | null;
  origemPeso: "erp" | "planilha" | null;
  marcavel: boolean;
  marcadoPorPadrao: boolean;
}

export interface AnaliseFatores {
  numeroProjeto: string;
  arquivoPlanilha: string;
  codEmpresa: number;
  ambiente: "teste" | "producao";
  abas: string[];
  linhas: LinhaFator[];
  totais: Record<SituacaoFator, number>;
}

/* Uma chamada ao ERP como foi: o que mostramos no "retorno completo do ERP". */
export interface ChamadaErp {
  etapa: "simulacao" | "gravacao";
  metodo: "POST" | "PUT";
  url: string;
  enviado: unknown;
  status: number | null;
  resposta: unknown;
}

export interface ResultadoFatores {
  id: string;
  ambiente: "teste" | "producao";
  incluidos: number;
  alterados: number;
  erro: string | null;
  chamadas: ChamadaErp[];
}

export async function analisarFatores(planilha: File): Promise<ApiEnvelope<AnaliseFatores>> {
  const response = await fetch("/api/engenharia-versatil/fatores/analisar", { method: "POST", body: comPlanilha(planilha) });
  return parseResponse(response);
}

export async function gravarFatores(planilha: File, marcados: string[]): Promise<ApiEnvelope<ResultadoFatores>> {
  const form = comPlanilha(planilha);
  form.append("marcados", JSON.stringify(marcados));
  const response = await fetch("/api/engenharia-versatil/fatores", { method: "POST", body: form });
  return parseResponse(response);
}

export interface ResultadoAjustePeso {
  id: string;
  ambiente: "teste" | "producao";
  codigo: string;
  pesoAntes: number | null;
  pesoDepois: number | null;
  brutoAntes: number | null;
  brutoDepois: number | null;
  taxaAntes: number | null;
  taxaDepois: number | null;
  leitura: string | null;
  avisos: string[];
  chamadas: ChamadaErp[];
}

export async function ajustarPeso(planilha: File, codigo: string, peso: number): Promise<ApiEnvelope<ResultadoAjustePeso>> {
  const form = comPlanilha(planilha);
  form.append("codigo", codigo);
  form.append("peso", String(peso));
  const response = await fetch("/api/engenharia-versatil/fatores/peso", { method: "POST", body: form });
  return parseResponse(response);
}
