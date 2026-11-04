import type {
  AnexoMovimentacao,
  BlocoTipoEquipamento,
  CampoPendenciaConfig,
  CampoTipoEquipamento,
  ClienteEstoqueItem,
  CondicaoBloco,
  CondicaoEquipamento,
  DirecaoOrdenacao,
  EmpresaOpcao,
  Equipamento,
  EquipamentoComEstrato,
  HistoricoAlteracaoDadosTecnicos,
  MotivoBaixa,
  OrdenacaoEquipamentos,
  PainelBiEstoque,
  PainelItens,
  ResultadoSincronizacaoErp,
  SituacaoErpEquipamento,
  StatusEquipamento,
  TentativaIntegracaoNf,
  TipoEquipamento,
  TipoNfIntegracao,
} from "../types/estoque.types";

interface ApiEnvelope<T> {
  ok: boolean;
  message?: string;
  data?: T;
}

async function parseResponse<T>(response: Response): Promise<ApiEnvelope<T>> {
  return response.json();
}

/*
 * Mesmo serviço externo de clientes já usado em Liberação de Projeto —
 * a URL em si mora agora em Administração → Equipamentos Usados →
 * Integração ERP (dbo.com_estoque_equipamentos_usados_config), não mais
 * hardcoded aqui. A chamada passa pelo servidor (rota abaixo) em vez de
 * ir direto do navegador pro serviço externo.
 */
export async function buscarClientesEstoque(): Promise<ClienteEstoqueItem[]> {
  const response = await fetch("/api/estoque-equipamentos-usados/clientes");
  const body = await parseResponse<ClienteEstoqueItem[]>(response);
  return body.data ?? [];
}

export async function listarEquipamentos(filtros: {
  condicao?: CondicaoEquipamento;
  status?: StatusEquipamento;
  busca?: string;
  codigoEmpresa?: string;
  pendenciaChave?: string;
  pagina: number;
  porPagina: number;
  ordenarPor?: OrdenacaoEquipamentos;
  direcao?: DirecaoOrdenacao;
}): Promise<{ itens: Equipamento[]; total: number } | null> {
  const params = new URLSearchParams();
  if (filtros.condicao) params.set("condicao", filtros.condicao);
  if (filtros.status) params.set("status", filtros.status);
  if (filtros.busca) params.set("busca", filtros.busca);
  if (filtros.codigoEmpresa) params.set("codigoEmpresa", filtros.codigoEmpresa);
  if (filtros.pendenciaChave) params.set("pendencia", filtros.pendenciaChave);
  params.set("pagina", String(filtros.pagina));
  params.set("porPagina", String(filtros.porPagina));
  if (filtros.ordenarPor) params.set("ordenarPor", filtros.ordenarPor);
  if (filtros.direcao) params.set("direcao", filtros.direcao);

  const response = await fetch(`/api/estoque-equipamentos-usados?${params.toString()}`);
  const body = await parseResponse<{ itens: Equipamento[]; total: number }>(response);
  return body.data ?? null;
}

export async function listarCamposComPendencia(): Promise<CampoPendenciaConfig[]> {
  const response = await fetch("/api/estoque-equipamentos-usados/pendencias");
  const body = await parseResponse<CampoPendenciaConfig[]>(response);
  return body.data ?? [];
}

export async function buscarEquipamento(id: string): Promise<ApiEnvelope<EquipamentoComEstrato>> {
  const response = await fetch(`/api/estoque-equipamentos-usados/${id}`);
  return parseResponse(response);
}

export async function listarAnexosMovimentacoesEquipamento(id: string): Promise<AnexoMovimentacao[]> {
  const response = await fetch(`/api/estoque-equipamentos-usados/${id}/anexos`);
  const body = await parseResponse<AnexoMovimentacao[]>(response);
  return body.data ?? [];
}

export async function listarHistoricoAlteracoesDados(id: string): Promise<HistoricoAlteracaoDadosTecnicos[]> {
  const response = await fetch(`/api/estoque-equipamentos-usados/${id}/historico-dados`);
  const body = await parseResponse<HistoricoAlteracaoDadosTecnicos[]>(response);
  return body.data ?? [];
}

export interface ResultadoTentativasNf {
  itens: TentativaIntegracaoNf[];
  total: number;
}

export async function listarTentativasNfEntrada(
  id: string,
  pagina: number,
  porPagina: number
): Promise<ResultadoTentativasNf> {
  const params = new URLSearchParams({ pagina: String(pagina), porPagina: String(porPagina) });
  const response = await fetch(`/api/estoque-equipamentos-usados/${id}/tentativas-nf?${params.toString()}`);
  const body = await parseResponse<ResultadoTentativasNf>(response);
  return body.data ?? { itens: [], total: 0 };
}

export async function tentarIntegracaoNfAgora(id: string): Promise<ApiEnvelope<ResultadoTentativasNf>> {
  const response = await fetch(`/api/estoque-equipamentos-usados/${id}/tentativas-nf`, { method: "POST" });
  return parseResponse(response);
}

export async function excluirEquipamento(id: string): Promise<ApiEnvelope<null>> {
  const response = await fetch(`/api/estoque-equipamentos-usados/${id}`, { method: "DELETE" });
  return parseResponse(response);
}

export async function duplicarEquipamento(
  id: string,
  novoNumero: number,
  novoIdErp: string | null = null
): Promise<ApiEnvelope<Equipamento>> {
  const response = await fetch(`/api/estoque-equipamentos-usados/${id}/duplicar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ novoNumero, novoIdErp }),
  });
  return parseResponse(response);
}

export async function criarEquipamento(formData: FormData): Promise<ApiEnvelope<EquipamentoComEstrato>> {
  const response = await fetch("/api/estoque-equipamentos-usados", {
    method: "POST",
    body: formData,
  });
  return parseResponse(response);
}

export async function atualizarDadosEquipamento(
  id: string,
  formData: FormData
): Promise<ApiEnvelope<EquipamentoComEstrato>> {
  const response = await fetch(`/api/estoque-equipamentos-usados/${id}/dados`, {
    method: "PATCH",
    body: formData,
  });
  return parseResponse(response);
}

export async function listarEmpresasAtivas(): Promise<EmpresaOpcao[]> {
  const response = await fetch("/api/estoque-equipamentos-usados/empresas");
  const body = await parseResponse<EmpresaOpcao[]>(response);
  return body.data ?? [];
}

export async function listarTiposEquipamentoAtivos(): Promise<TipoEquipamento[]> {
  const response = await fetch("/api/estoque-equipamentos-usados/tipos");
  const body = await parseResponse<TipoEquipamento[]>(response);
  return body.data ?? [];
}

export async function listarCamposDoTipoEquipamento(
  tipoEquipamentoId: string
): Promise<CampoTipoEquipamento[]> {
  const response = await fetch(`/api/estoque-equipamentos-usados/tipos/${tipoEquipamentoId}/campos`);
  const body = await parseResponse<CampoTipoEquipamento[]>(response);
  return body.data ?? [];
}

export async function listarBlocosDoTipoEquipamento(
  tipoEquipamentoId: string
): Promise<BlocoTipoEquipamento[]> {
  const response = await fetch(`/api/estoque-equipamentos-usados/tipos/${tipoEquipamentoId}/blocos`);
  const body = await parseResponse<BlocoTipoEquipamento[]>(response);
  return body.data ?? [];
}

/* =========================================================
   ADMIN — tipos de equipamento e seus campos
   ========================================================= */

export async function listarTiposEquipamentoAdmin(): Promise<TipoEquipamento[]> {
  const response = await fetch("/api/admin/estoque-equipamentos-usados/tipos");
  const body = await parseResponse<TipoEquipamento[]>(response);
  return body.data ?? [];
}

export async function criarTipoEquipamento(nome: string): Promise<ApiEnvelope<TipoEquipamento>> {
  const response = await fetch("/api/admin/estoque-equipamentos-usados/tipos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nome }),
  });
  return parseResponse(response);
}

export async function atualizarTipoEquipamento(
  id: string,
  dados: { nome?: string; ativo?: boolean; condicao?: CondicaoBloco }
): Promise<ApiEnvelope<TipoEquipamento>> {
  const response = await fetch(`/api/admin/estoque-equipamentos-usados/tipos/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  return parseResponse(response);
}

export async function excluirTipoEquipamento(id: string): Promise<ApiEnvelope<null>> {
  const response = await fetch(`/api/admin/estoque-equipamentos-usados/tipos/${id}`, {
    method: "DELETE",
  });
  return parseResponse(response);
}

export async function listarBlocosDoTipoAdmin(tipoEquipamentoId: string): Promise<BlocoTipoEquipamento[]> {
  const response = await fetch(`/api/admin/estoque-equipamentos-usados/tipos/${tipoEquipamentoId}/blocos`);
  const body = await parseResponse<BlocoTipoEquipamento[]>(response);
  return body.data ?? [];
}

export async function criarBlocoTipoEquipamento(
  tipoEquipamentoId: string,
  nome: string
): Promise<ApiEnvelope<BlocoTipoEquipamento>> {
  const response = await fetch(`/api/admin/estoque-equipamentos-usados/tipos/${tipoEquipamentoId}/blocos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nome }),
  });
  return parseResponse(response);
}

export async function atualizarBlocoTipoEquipamento(
  tipoEquipamentoId: string,
  blocoId: string,
  dados: Partial<{ nome: string; ordem: number; ativo: boolean; condicao: CondicaoBloco }>
): Promise<ApiEnvelope<null>> {
  const response = await fetch(
    `/api/admin/estoque-equipamentos-usados/tipos/${tipoEquipamentoId}/blocos/${blocoId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dados),
    }
  );
  return parseResponse(response);
}

export async function excluirBlocoTipoEquipamento(
  tipoEquipamentoId: string,
  blocoId: string
): Promise<ApiEnvelope<null>> {
  const response = await fetch(
    `/api/admin/estoque-equipamentos-usados/tipos/${tipoEquipamentoId}/blocos/${blocoId}`,
    { method: "DELETE" }
  );
  return parseResponse(response);
}

export async function listarCamposDoTipoAdmin(tipoEquipamentoId: string): Promise<CampoTipoEquipamento[]> {
  const response = await fetch(`/api/admin/estoque-equipamentos-usados/tipos/${tipoEquipamentoId}/campos`);
  const body = await parseResponse<CampoTipoEquipamento[]>(response);
  return body.data ?? [];
}

export async function criarCampoTipoEquipamento(
  tipoEquipamentoId: string,
  dados: {
    blocoId: string;
    chave: string;
    rotulo: string;
    tipoDado: string;
    opcoes: string[] | null;
    unidade: string | null;
    obrigatorio: boolean;
    ordem: number;
    vemDeIntegracao?: boolean;
  }
): Promise<ApiEnvelope<CampoTipoEquipamento>> {
  const response = await fetch(`/api/admin/estoque-equipamentos-usados/tipos/${tipoEquipamentoId}/campos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  return parseResponse(response);
}

export async function atualizarCampoTipoEquipamento(
  tipoEquipamentoId: string,
  campoId: string,
  dados: Partial<{
    rotulo: string;
    tipoDado: string;
    opcoes: string[] | null;
    unidade: string | null;
    obrigatorio: boolean;
    ordem: number;
    ativo: boolean;
    geraPendencia: boolean;
    travaMovimentacao: boolean;
    vemDeIntegracao: boolean;
    mostrarBiItens: boolean;
    condicao: CondicaoBloco;
    obrigatorioNovo: boolean;
  }>
): Promise<ApiEnvelope<null>> {
  const response = await fetch(
    `/api/admin/estoque-equipamentos-usados/tipos/${tipoEquipamentoId}/campos/${campoId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dados),
    }
  );
  return parseResponse(response);
}

export async function excluirCampoTipoEquipamento(
  tipoEquipamentoId: string,
  campoId: string
): Promise<ApiEnvelope<null>> {
  const response = await fetch(
    `/api/admin/estoque-equipamentos-usados/tipos/${tipoEquipamentoId}/campos/${campoId}`,
    { method: "DELETE" }
  );
  return parseResponse(response);
}

export async function restaurarCampoSistemaEquipamento(
  tipoEquipamentoId: string,
  chave: string
): Promise<ApiEnvelope<CampoTipoEquipamento>> {
  const response = await fetch(
    `/api/admin/estoque-equipamentos-usados/tipos/${tipoEquipamentoId}/campos/sistema`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chave }),
    }
  );
  return parseResponse(response);
}

export async function buscarSequenciaEquipamentos(): Promise<{ ultimoNumero: number } | null> {
  const response = await fetch("/api/admin/estoque-equipamentos-usados/sequencia");
  const body = await parseResponse<{ ultimoNumero: number }>(response);
  return body.data ?? null;
}

export async function definirSequenciaEquipamentos(
  ultimoNumero: number
): Promise<ApiEnvelope<{ ultimoNumero: number }>> {
  const response = await fetch("/api/admin/estoque-equipamentos-usados/sequencia", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ultimoNumero }),
  });
  return parseResponse(response);
}

interface AcaoComDestinatarioDados {
  numeroNf: string;
  destinatarioNome: string;
  valor: number | null;
  dataEmissaoNf: string | null;
  observacoes: string | null;
  anexos?: File[];
}

function montarFormDataAcao(dados: Record<string, string | null | undefined>, anexos?: File[]): FormData {
  const formData = new FormData();
  for (const [chave, valor] of Object.entries(dados)) {
    formData.set(chave, valor ?? "");
  }
  for (const arquivo of anexos ?? []) {
    formData.append("anexos", arquivo);
  }
  return formData;
}

export async function registrarEmprestimo(
  id: string,
  dados: AcaoComDestinatarioDados
): Promise<ApiEnvelope<EquipamentoComEstrato>> {
  const response = await fetch(`/api/estoque-equipamentos-usados/${id}/emprestimo`, {
    method: "POST",
    body: montarFormDataAcao(
      {
        numeroNf: dados.numeroNf,
        destinatarioNome: dados.destinatarioNome,
        valor: dados.valor !== null ? String(dados.valor) : null,
        dataEmissaoNf: dados.dataEmissaoNf,
        observacoes: dados.observacoes,
      },
      dados.anexos
    ),
  });
  return parseResponse(response);
}

export async function registrarConsignacao(
  id: string,
  dados: AcaoComDestinatarioDados
): Promise<ApiEnvelope<EquipamentoComEstrato>> {
  const response = await fetch(`/api/estoque-equipamentos-usados/${id}/consignacao`, {
    method: "POST",
    body: montarFormDataAcao(
      {
        numeroNf: dados.numeroNf,
        destinatarioNome: dados.destinatarioNome,
        valor: dados.valor !== null ? String(dados.valor) : null,
        dataEmissaoNf: dados.dataEmissaoNf,
        observacoes: dados.observacoes,
      },
      dados.anexos
    ),
  });
  return parseResponse(response);
}

export async function registrarRetorno(
  id: string,
  dados: { numeroNf: string; observacoes: string | null; anexos?: File[] }
): Promise<ApiEnvelope<EquipamentoComEstrato>> {
  const response = await fetch(`/api/estoque-equipamentos-usados/${id}/retorno`, {
    method: "POST",
    body: montarFormDataAcao({ numeroNf: dados.numeroNf, observacoes: dados.observacoes }, dados.anexos),
  });
  return parseResponse(response);
}

export async function registrarBaixa(
  id: string,
  dados: {
    numeroNf: string;
    motivoBaixa: MotivoBaixa;
    destinatarioNome: string | null;
    valor: number | null;
    dataEmissaoNf: string | null;
    observacoes: string | null;
    anexos?: File[];
  }
): Promise<ApiEnvelope<EquipamentoComEstrato>> {
  const response = await fetch(`/api/estoque-equipamentos-usados/${id}/baixa`, {
    method: "POST",
    body: montarFormDataAcao(
      {
        numeroNf: dados.numeroNf,
        motivoBaixa: dados.motivoBaixa,
        destinatarioNome: dados.destinatarioNome,
        valor: dados.valor !== null ? String(dados.valor) : null,
        dataEmissaoNf: dados.dataEmissaoNf,
        observacoes: dados.observacoes,
      },
      dados.anexos
    ),
  });
  return parseResponse(response);
}

export async function buscarNfSaida(
  id: string,
  dados: { numeroNf: string; tipoNf: TipoNfIntegracao }
): Promise<
  ApiEnvelope<{
    encontrado: boolean;
    destinatarioNome: string | null;
    valor: number | null;
    dataEmissaoIso: string | null;
    mensagem: string;
  }>
> {
  const response = await fetch(`/api/estoque-equipamentos-usados/${id}/nf-saida`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  return parseResponse(response);
}

export async function validarEquipamentoNoErp(
  id: string,
  codigoErp: string
): Promise<ApiEnvelope<EquipamentoComEstrato>> {
  const response = await fetch(`/api/estoque-equipamentos-usados/${id}/validar-erp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ codigoErp }),
  });
  return parseResponse(response);
}

/*
 * Rota pública (roda numa TV sem sessão de usuário — ver
 * src/lib/auth/rotas-publicas.ts) — usa fetch puro sem depender de
 * cookie de login.
 */
export async function buscarPainelBiEstoque(condicao: CondicaoEquipamento = "usado"): Promise<ApiEnvelope<PainelBiEstoque>> {
  const response = await fetch(`/api/estoque-equipamentos-usados/painel?condicao=${condicao}`, { cache: "no-store" });
  return parseResponse<PainelBiEstoque>(response);
}

/* BI de itens (TV, sem sessão): tabela de itens com as informações técnicas. */
export async function buscarPainelItens(condicao: CondicaoEquipamento): Promise<ApiEnvelope<PainelItens>> {
  try {
    const response = await fetch(`/api/estoque-equipamentos-usados/painel/itens?condicao=${condicao}`, { cache: "no-store" });
    return await parseResponse<PainelItens>(response);
  } catch {
    return { ok: false, message: "Sem conexão com o Portal." };
  }
}

/* ---------- integração pelo extrato do ERP ---------- */

export async function buscarSituacaoErp(id: string): Promise<SituacaoErpEquipamento | null> {
  const response = await fetch(`/api/estoque-equipamentos-usados/${id}/erp`, { cache: "no-store" });
  const body = await parseResponse<SituacaoErpEquipamento>(response).catch(() => null);
  return body?.data ?? null;
}

export async function atualizarDoErp(id: string): Promise<ApiEnvelope<ResultadoSincronizacaoErp>> {
  try {
    const response = await fetch(`/api/estoque-equipamentos-usados/${id}/erp`, { method: "POST" });
    return await parseResponse<ResultadoSincronizacaoErp>(response);
  } catch {
    return { ok: false, message: "Sem conexão com o Portal. Tente de novo." };
  }
}

/* Troca o número do equipamento (admin). Volta o id do registro novo. */
export async function corrigirNumeroSerieEquipamento(
  id: string,
  dados: { numeroSerie: string; motivo: string }
): Promise<ApiEnvelope<{ numeroSerieAnterior: string | null; numeroSerie: string }>> {
  try {
    const response = await fetch(`/api/estoque-equipamentos-usados/${id}/numero-serie`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dados),
    });
    return await parseResponse<{ numeroSerieAnterior: string | null; numeroSerie: string }>(response);
  } catch {
    return { ok: false, message: "Sem conexão com o Portal. Tente de novo." };
  }
}

export async function corrigirDadosErpEquipamento(
  id: string,
  dados: { erpCodigoItem: string; erpIdItem: string; motivo: string }
): Promise<ApiEnvelope<{ erpCodigoItem: string; erpIdItem: string; extratoAtualizado: boolean }>> {
  try {
    const response = await fetch(`/api/estoque-equipamentos-usados/${id}/dados-erp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dados),
    });
    return await parseResponse<{ erpCodigoItem: string; erpIdItem: string; extratoAtualizado: boolean }>(response);
  } catch {
    return { ok: false, message: "Sem conexão com o Portal. Tente de novo." };
  }
}

export async function ajustarStatusEquipamento(
  id: string,
  dados: { status: StatusEquipamento; motivoBaixa: MotivoBaixa | null; comQuem: string | null; motivo: string }
): Promise<ApiEnvelope<{ statusAnterior: StatusEquipamento; novoStatus: StatusEquipamento }>> {
  try {
    const response = await fetch(`/api/estoque-equipamentos-usados/${id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dados),
    });
    return await parseResponse<{ statusAnterior: StatusEquipamento; novoStatus: StatusEquipamento }>(response);
  } catch {
    return { ok: false, message: "Sem conexão com o Portal. Tente de novo." };
  }
}

export async function trocarNumeroEquipamento(
  id: string,
  dados: { novoNumero: number; trocarNumeroSerie: boolean; desfazerIntegracao: boolean; motivo: string }
): Promise<ApiEnvelope<{ novoId: string; numeroAntigo: number; novoNumero: number }>> {
  try {
    const response = await fetch(`/api/estoque-equipamentos-usados/${id}/numero`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dados),
    });
    return await parseResponse<{ novoId: string; numeroAntigo: number; novoNumero: number }>(response);
  } catch {
    return { ok: false, message: "Sem conexão com o Portal. Tente de novo." };
  }
}
