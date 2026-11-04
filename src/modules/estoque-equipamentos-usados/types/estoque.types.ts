export interface EmpresaOpcao {
  id: string;
  nome: string;
  codigo: string | null;
}

/* Normalizado no servidor (listarClientesErp) — o ERP manda COD_CLI/DESCRICAO/CNPJ. */
export interface ClienteEstoqueItem {
  cod_cli: string;
  descricao: string;
  /* Só dígitos. Nem todo cliente do ERP tem CNPJ cadastrado. */
  cnpj: string | null;
}

export type StatusEquipamento = "em_estoque" | "emprestado" | "consignado" | "em_reforma" | "baixado";

/* Usado (entra por NF de compra, número automático) ou novo (fabricação interna, número digitado por tipo). */
export type CondicaoEquipamento = "usado" | "novo";
/* Para quais equipamentos um bloco do tipo vale. */
export type CondicaoBloco = "ambos" | "usado" | "novo";

/* Colunas da lista que ordenam ao clicar no título (a ordenação é no servidor, por causa da paginação). */
export type OrdenacaoEquipamentos = "numero" | "descricao" | "cliente" | "marcaModelo" | "status" | "criadoEm";
export type DirecaoOrdenacao = "asc" | "desc";
export type TipoAcaoMovimentacao =
  | "entrada"
  | "emprestimo"
  | "consignacao"
  | "reforma"
  | "retorno"
  | "baixa"
  | "transferencia"
  | "nf_vinculada";
export type MotivoBaixa = "venda" | "descarte" | "perda" | "outro";

export interface Equipamento {
  id: string;
  numero: number;
  condicao: CondicaoEquipamento;
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
  /* "erp" = lançada pela integração a partir do extrato do ERP. */
  origem: "portal" | "erp";
  /* Já casada com uma movimentação do extrato do ERP (mesma NF). */
  confirmadaErp: boolean;
  /* Id da movimentação do ERP que confirma esta (liga as duas no extrato unificado). */
  erpIdMovimentacao: string | null;
  /* Ajuste manual de status pelo administrador (ERP errado) -- vale até o ERP ter movimento mais novo. */
  ajusteManual: boolean;
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

/* "ambiguo": o ERP devolveu mais de uma NF possível e nada foi aplicado -- alguém precisa escolher. */
export type StatusTentativaIntegracaoNf = "sucesso" | "nao_encontrado" | "erro" | "ambiguo";
export type TipoNfIntegracao = "entrada" | "saida_emprestimo" | "saida_consignacao" | "saida_venda" | "extrato";

/* Espelho de src/lib/estoque-equipamentos-usados/extrato-integracao.ts (server-only). */
export interface MovimentoErpGravado {
  idMovimentacao: string;
  data: string;
  tipo: string;
  tipoLabel: string;
  sentido: string;
  nfNumero: string | null;
  nfSerie: string | null;
  nfDataEmissao: string | null;
  cfop: number | null;
  naturezaOperacao: string | null;
  contraparteNome: string | null;
  contraparteCnpj: string | null;
  valorTotalItem: number | null;
  custoCompra: number | null;
  localDepois: string | null;
  vendaDeConsignacao: boolean | null;
  removido: boolean;
}

export interface SituacaoErpEquipamento {
  local: string | null;
  desde: string | null;
  codEmp: number | null;
  contraparte: string | null;
  custoCompra: number | null;
  sincronizadoEm: string | null;
  erro: string | null;
  movimentos: MovimentoErpGravado[];
}

export interface ResultadoSincronizacaoErp {
  numero: number;
  statusAntes: StatusEquipamento;
  statusDepois: StatusEquipamento;
  motivoStatus: string;
  movimentosErpNovos: number;
  movimentosErpRemovidos: number;
  movimentacoesCriadas: number;
  movimentacoesVinculadas: number;
  movimentacoesRemovidas: number;
  pdfsAnexados: number;
  erro: string | null;
}

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
  /* Em quais entradas o tipo aparece (usados, novos ou os dois). */
  condicao: CondicaoBloco;
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
  condicao: CondicaoBloco;
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
  /* Vira coluna na tabela do BI de itens (TV). */
  mostrarBiItens: boolean;
  /* Para quais equipamentos o campo aparece; obrigatorioNovo = obrigatório no novo (obrigatorio vale para o usado). */
  condicao: CondicaoBloco;
  obrigatorioNovo: boolean;
}

export interface CampoPendenciaConfig {
  tipoEquipamentoId: string;
  chave: string;
  rotulo: string;
  travaMovimentacao: boolean;
  /* Para quais equipamentos o campo aparece: pendência só conta onde ele existe. */
  condicao: CondicaoBloco;
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
  quantidadeEmprestado: number;
  quantidadeConsignado: number;
}

/* Espelho de src/lib/estoque-equipamentos-usados/painel-itens.ts (BI de itens, TV). */
export interface PainelItens {
  condicao: CondicaoEquipamento;
  totalItens: number;
  tipos: {
    tipoId: string;
    tipoNome: string;
    colunas: { chave: string; rotulo: string }[];
    linhas: {
      id: string;
      numero: number;
      descricao: string;
      status: StatusEquipamento;
      comQuem: string | null;
      valores: Record<string, string>;
    }[];
  }[];
  atualizadoEm: string;
}

export interface PainelBiEstoque {
  totalEquipamentos: number;
  valorTotalEmEstoque: number;
  pendencias: number;
  semNfEntrada: number;
  nfAguardandoValidacao: number;
  porStatus: PainelBiContagemStatus[];
  porTipo: PainelBiTipo[];
  entradasPorMes: PainelBiMes[];
  movimentacoesRecentes: PainelBiMovimentacao[];
  clientesComEquipamentoFora: PainelBiCliente[];
  atualizadoEm: string;
}
