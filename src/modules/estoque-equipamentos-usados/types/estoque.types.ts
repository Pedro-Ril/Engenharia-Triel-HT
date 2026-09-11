export interface EmpresaOpcao {
  id: string;
  nome: string;
  codigo: string | null;
}

/* Mesmo formato de dbo `/api/clientes` já usado em Liberação de Projeto. */
export interface ClienteEstoqueItem {
  cod_cli: string;
  descricao: string;
}

export type StatusEquipamento = "em_estoque" | "emprestado" | "consignado" | "baixado";
export type TipoAcaoMovimentacao =
  | "entrada"
  | "emprestimo"
  | "consignacao"
  | "retorno"
  | "baixa"
  | "nf_vinculada";
export type MotivoBaixa = "venda" | "descarte" | "perda" | "outro";

export interface Equipamento {
  id: string;
  numero: number;
  tipoEquipamentoId: string | null;
  nomeCliente: string | null;
  codigoCliente: string | null;
  valor: number | null;
  descricao: string;
  marca: string | null;
  modelo: string | null;
  numeroSerie: string | null;
  codigoEmpresa: string | null;
  erpCodigoItem: string | null;
  erpIdItem: string | null;
  erpDataEntrada: string | null;
  erpValidadoEm: string | null;
  erpValidadoPor: string | null;
  status: StatusEquipamento;
  numeroNfEntrada: string | null;
  observacoes: string | null;
  camposValores: Record<string, unknown> | null;
  criadoPorNome: string;
  criadoEm: string;
  atualizadoEm: string;
}

export interface MovimentacaoEquipamento {
  id: string;
  equipamentoId: string;
  tipoAcao: TipoAcaoMovimentacao;
  numeroNf: string | null;
  destinatarioNome: string | null;
  motivoBaixa: MotivoBaixa | null;
  valor: number | null;
  dataEmissaoNf: string | null;
  statusResultante: StatusEquipamento;
  observacoes: string | null;
  dataAcao: string;
  criadoPorNome: string;
  criadoEm: string;
}

export interface AnexoMovimentacao {
  id: string;
  movimentacaoId: string;
  nomeArquivo: string;
  tipoMime: string;
  tamanhoBytes: number;
  criadoPorNome: string;
  criadoEm: string;
}

export interface AlteracaoDadosTecnicosHistorico {
  campo: string;
  rotulo: string;
  de: unknown;
  para: unknown;
}

export interface HistoricoAlteracaoDadosTecnicos {
  id: string;
  alteracoes: AlteracaoDadosTecnicosHistorico[];
  autorNome: string;
  criadoEm: string;
  motivo: string | null;
}

export type StatusTentativaIntegracaoNf = "sucesso" | "nao_encontrado" | "erro";
export type TipoNfIntegracao = "entrada" | "saida_emprestimo" | "saida_consignacao" | "saida_venda";

export interface TentativaIntegracaoNf {
  id: string;
  tipoNf: TipoNfIntegracao;
  status: StatusTentativaIntegracaoNf;
  mensagem: string | null;
  parametrosConsulta: string | null;
  disparadoPor: string | null;
  iniciadoEm: string;
  requestUrl: string | null;
  responseStatus: number | null;
  responseBody: string | null;
}

export interface EquipamentoComEstrato extends Equipamento {
  movimentacoes: MovimentacaoEquipamento[];
}

export type TipoDadoCampoEquipamento =
  | "texto"
  | "numero"
  | "data"
  | "booleano"
  | "unica_escolha"
  | "multipla_escolha";

export interface TipoEquipamento {
  id: string;
  nome: string;
  ativo: boolean;
  criadoEm: string;
  atualizadoEm: string;
}

export interface BlocoTipoEquipamento {
  id: string;
  tipoEquipamentoId: string;
  nome: string;
  ehFixo: boolean;
  ordem: number;
  ativo: boolean;
}

export interface CampoTipoEquipamento {
  id: string;
  tipoEquipamentoId: string;
  blocoId: string;
  blocoNome: string;
  chave: string;
  rotulo: string;
  tipoDado: TipoDadoCampoEquipamento;
  opcoes: string[] | null;
  unidade: string | null;
  obrigatorio: boolean;
  ordem: number;
  ativo: boolean;
  ehSistema: boolean;
  geraPendencia: boolean;
  travaMovimentacao: boolean;
  vemDeIntegracao: boolean;
}

export interface CampoPendenciaConfig {
  tipoEquipamentoId: string;
  chave: string;
  rotulo: string;
  travaMovimentacao: boolean;
}

export interface EvidenciaEquipamento {
  id: string;
  equipamentoId: string;
  blocoId: string;
  nomeArquivo: string;
  tipoMime: string;
  tamanhoBytes: number;
  criadoPorNome: string;
  criadoEm: string;
}

export interface PainelBiContagemStatus {
  status: StatusEquipamento;
  quantidade: number;
  valorTotal: number;
}

export interface PainelBiTipo {
  tipoId: string;
  tipoNome: string;
  quantidade: number;
  valorTotal: number;
}

export interface PainelBiMes {
  mes: string;
  quantidade: number;
}

export interface PainelBiMovimentacao {
  equipamentoId: string;
  equipamentoNumero: number;
  equipamentoDescricao: string;
  tipoAcao: TipoAcaoMovimentacao;
  numeroNf: string | null;
  destinatarioNome: string | null;
  dataAcao: string;
  criadoPorNome: string;
}

export interface PainelBiCliente {
  nomeCliente: string;
  quantidade: number;
}

export interface PainelBiEstoque {
  totalEquipamentos: number;
  valorTotalEmEstoque: number;
  pendencias: number;
  semNfEntrada: number;
  porStatus: PainelBiContagemStatus[];
  porTipo: PainelBiTipo[];
  entradasPorMes: PainelBiMes[];
  movimentacoesRecentes: PainelBiMovimentacao[];
  clientesComEquipamentoFora: PainelBiCliente[];
  atualizadoEm: string;
}
