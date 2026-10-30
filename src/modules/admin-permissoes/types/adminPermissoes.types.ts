export interface PortalSetor {
  id: string;
  chave: string;
  nome: string;
  icone: string | null;
  ordem: number;
  ativo: boolean;
}

export interface PortalModulo {
  id: string;
  setorIds: string[];
  chave: string;
  nome: string;
  path: string;
  icone: string | null;
  publicoSemLogin: boolean;
  publicoAutenticado: boolean;
  emDesenvolvimento: boolean;
  restritoAtendenteChamados: boolean;
  ativo: boolean;
  ordem: number;
}

export interface PortalUsuarioAdmin {
  id: string;
  samAccountName: string;
  nomeExibicao: string;
  email: string | null;
  codigoEmpresa: string | null;
  departamento: string | null;
  ehAdministrador: boolean;
  ativo: boolean;
  sessaoInvalidadaEm: string | null;
  ultimoLoginEm: string | null;
  ultimaAtividadeEm: string | null;
}

export interface Empresa {
  id: string;
  nome: string;
  codigo: string | null;
  cnpj: string | null;
  corPrimariaClara: string;
  corPrimariaEscura: string;
  ativa: boolean;
}

export interface TemaPadrao {
  corPrimariaClara: string;
  corPrimariaEscura: string;
}

export interface PortalPermissao {
  id: string;
  usuarioId: string;
  moduloId: string;
  concedidoEm: string;
  concedidoPor: string;
}

export interface BuscaTerminalFabrica {
  id: string;
  codigoBuscado: string;
  encontrado: boolean;
  buscadoEm: string;
  usuarioNome: string | null;
  ipOrigem: string | null;
}

export interface ResumoBuscasTerminalFabrica {
  totalBuscas: number;
  buscasHoje: number;
  naoEncontrados: number;
}

/* Espelha src/lib/terminal-fabrica/impressao.ts. */
export interface PermissaoImpressaoTerminal {
  usuarioId: string;
  usuarioNome: string;
  concedidoEm: string;
  concedidoPor: string | null;
}

export interface ImpressaoTerminal {
  id: string;
  usuarioNome: string;
  codigoItem: string;
  totalPaginas: number | null;
  impressoEm: string;
  ipOrigem: string | null;
}

export interface ResumoImpressoesTerminal {
  totalImpressoes: number;
  impressoesHoje: number;
  usuariosLiberados: number;
}

export interface ConfiguracaoAd {
  url: string;
  baseDn: string;
  usuarioServico: string;
  senhaConfigurada: boolean;
  grupoAdminDn: string;
  grupoUsuariosDn: string | null;
  atualizadoEm: string;
  atualizadoPor: string | null;
}

export interface ResultadoTesteConexaoAd {
  conectou: boolean;
  grupoAdminExiste: boolean;
  grupoUsuariosExiste: boolean | null;
  mensagemErro: string | null;
}

export interface ConfiguracaoDb {
  server: string;
  database: string;
  user: string;
  senhaConfigurada: boolean;
  encrypt: boolean;
  trustServerCertificate: boolean;
}

export interface ResultadoTesteConexaoDb {
  conectou: boolean;
  mensagemErro: string | null;
}

export interface ConfiguracaoFirebird {
  host: string;
  port: number;
  database: string;
  user: string;
  senhaConfigurada: boolean;
  charset: string;
  role: string;
  poolMin: number;
  poolMax: number;
}

export type TipoRegraEscopo = "unidade_permitida" | "setor_excluido" | "colaborador_excluido";

export interface RegraEscopo {
  id: string;
  tipo: TipoRegraEscopo;
  valor: string;
  valorRotulo: string | null;
}

/* Configuração do módulo de aprovações: para onde vai o relatório que o solicitante dispara. */
export type ModoPainelAprovacoes = "colaborador" | "solicitacao";

export interface ConfigAprovacoes {
  emailRelatorio: string | null;
  urlPublica: string | null;
  modoPainelPadrao: ModoPainelAprovacoes;
  atualizadoEm: string | null;
  atualizadoPor: string | null;
}

/* Pedidos de compra: integração com o ERP e situação da chave do SupriConnect. */
export interface ConfigPedidosCompra {
  urlPedido: string | null;
  urlPedidoTeste: string | null;
  usarAmbienteTeste: boolean;
  chaveApiErp: string | null;
  chaveExternaConfigurada: boolean;
  chaveExternaFinal: string | null;
  chaveExternaGeradaEm: string | null;
  chaveExternaGeradaPor: string | null;
  atualizadoEm: string | null;
  atualizadoPor: string | null;
}

export interface ResultadoTesteErpPedido {
  url: string;
  ambiente: "producao" | "teste";
  status: number | null;
  duracaoMs: number;
  corpo: string;
}

/* Alçadas de aprovação (Diretoria → Alçadas). */
export interface AlcadaNivelUsuario {
  id: string;
  nome: string;
}

export interface AlcadaNivel {
  id: string;
  ordem: number;
  nome: string;
  usuarios: AlcadaNivelUsuario[];
}

/* Quem já vem escolhido no próximo nível quando o anterior aprova (quem aprova pode trocar). */
export interface AlcadaSugestao {
  id: string;
  nivelId: string;
  empresa: number | null;
  centrosCusto: string | null;
  /* null = todos do nível. */
  usuarioId: string | null;
  usuarioNome: string | null;
}

export interface AlcadaConfig {
  id: string;
  tipo: string;
  empresa: number | null;
  setor: string | null;
  niveis: AlcadaNivel[];
  sugestoes: AlcadaSugestao[];
  atualizadoEm: string;
  atualizadoPor: string | null;
}

/* Rubrica de um aprovador, estampada no PDF do pedido de compra quando ele aprova. */
export interface RubricaAprovador {
  usuarioId: string;
  nome: string;
  naAlcada: boolean;
  temRubrica: boolean;
  atualizadoEm: string | null;
  atualizadoPor: string | null;
}

export interface HistoricoAlcada {
  tipo: string;
  descricao: string;
  usuarioNome: string | null;
  criadoEm: string;
}

/* O que a tela manda ao salvar: níveis em ordem, com os ids das pessoas. */
export interface DadosAlcadaEnvio {
  tipo: string;
  empresa: number | null;
  setor: string | null;
  niveis: { id?: string; nome: string; usuarioIds: string[] }[];
  /* nivelIndice: posição (0 = 1º) do nível na lista `niveis` acima. */
  sugestoes: { nivelIndice: number; empresa: number | null; centrosCusto: string | null; usuarioId: string | null }[];
}

export interface ResultadoTesteConexaoFirebird {
  conectou: boolean;
  mensagemErro: string | null;
}

export type TipoAtualizacaoItem = "novo" | "melhoria" | "correcao";

export interface AtualizacaoTag {
  id: string;
  chave: string;
  nome: string;
  cor: string;
  ordem: number;
  ativo: boolean;
}

export interface AtualizacaoItem {
  id: string;
  tipo: TipoAtualizacaoItem;
  texto: string;
  ordem: number;
  tags: AtualizacaoTag[];
}

export interface Atualizacao {
  id: string;
  versao: string;
  titulo: string;
  descricao: string;
  publicadoEm: string;
  publicado: boolean;
  ordem: number;
  tags: AtualizacaoTag[];
  itens: AtualizacaoItem[];
  criadoEm: string;
  atualizadoEm: string;
  criadoPor: string | null;
}

export interface StatusManutencao {
  ativo: boolean;
  mensagem: string | null;
  ativadoEm: string | null;
  ativadoPor: string | null;
}

export interface ConfigMateriaPrima {
  apiBaseUrl: string;
  intervaloSincronizacaoMinutos: number | null;
  atualizadoEm: string | null;
  atualizadoPor: string | null;
}

export interface ConfigEstruturaSubstituicao {
  urlConsultaEstrutura: string | null;
  urlValidarItens: string | null;
  urlAtualizarEstrutura: string | null;
  urlConsultaEstruturaTeste: string | null;
  urlValidarItensTeste: string | null;
  urlAtualizarEstruturaTeste: string | null;
  usarAmbienteTeste: boolean;
  atualizadoEm: string | null;
  atualizadoPor: string | null;
}

export interface ConfigErpEstoqueUsados {
  urlValidarItem: string | null;
  urlValidarItemTeste: string | null;
  urlClientes: string | null;
  urlClientesTeste: string | null;
  usarAmbienteTeste: boolean;
  chaveApi: string | null;
  urlNfEntrada: string | null;
  urlNfEntradaTeste: string | null;
  urlNfSaida: string | null;
  urlNfSaidaTeste: string | null;
  intervaloVerificacaoNfMinutos: number | null;
  campoMascaraChave: string;
  ultimaExecucaoNfEm: string | null;
  urlExtrato: string | null;
  urlExtratoTeste: string | null;
  intervaloExtratoMinutos: number;
  ultimaExecucaoExtratoEm: string | null;
  pastaPdfNfSaida: string | null;
  codEmpPdfNfSaida: number | null;
  atualizadoEm: string | null;
  atualizadoPor: string | null;
}

export interface ResultadoSincronizacaoExtrato {
  equipamentoId: string;
  numero: number;
  statusAntes: string;
  statusDepois: string;
  motivoStatus: string;
  movimentosErpNovos: number;
  movimentosErpRemovidos: number;
  movimentacoesCriadas: number;
  movimentacoesVinculadas: number;
  movimentacoesRemovidas: number;
  pdfsAnexados: number;
  erro: string | null;
}

export interface ConfigIntegraLantek {
  foccoApiBaseUrl: string | null;
  foccoApiChave: string | null;
  tokenConfigurado: boolean;
  pastaDxf: string | null;
  pastaDesenhos: string | null;
  pastaExportacaoAgro: string | null;
  pastaExportacaoVe: string | null;
  atualizadoEm: string | null;
  atualizadoPor: string | null;
}

export interface ConfigIntegraTubest {
  foccoApiBaseUrl: string | null;
  foccoApiChave: string | null;
  tokenConfigurado: boolean;
  pastaStep: string | null;
  pastaStepCiber: string | null;
  atualizadoEm: string | null;
  atualizadoPor: string | null;
}

/* Engenharia Versátil (espelha src/lib/engenharia-versatil/separacao.ts). */
export interface ConfigEngenhariaVersatil {
  pastaProjetos: string | null;
  pastaPdf: string | null;
  pastaDxf: string | null;
  abasBlacklist: string[];
  abasComDxf: string[];
  abasFator: string[];
  erpApiUrl: string | null;
  erpCodEmpresa: number | null;
  erpAmbiente: "teste" | "producao";
  atualizadoEm: string | null;
  atualizadoPor: string | null;
}

/* Pastas da Conferência de Derivados de uma empresa (espelha src/lib/conferencia-derivados/config.ts). */
export interface ConfigConferenciaDerivados {
  empresaId: string;
  empresaNome: string;
  empresaCodigo: string | null;
  totalUsuarios: number;
  pastaPdf: string | null;
  pastaDxf: string | null;
  pastaStep: string | null;
  atualizadoEm: string | null;
  atualizadoPor: string | null;
}

export type CriptografiaSmtp = "nenhuma" | "ssl" | "tls";

export interface ConfiguracaoSmtp {
  host: string;
  porta: number;
  criptografia: CriptografiaSmtp;
  autenticacaoAtiva: boolean;
  usuario: string | null;
  senhaConfigurada: boolean;
  remetenteNome: string | null;
  remetenteEmail: string;
  atualizadoEm: string;
  atualizadoPor: string | null;
}

export interface TransferenciaConfig {
  pastaArmazenamento: string | null;
  duracaoMaximaHoras: number | null;
  urlPublica: string | null;
  atualizadoEm: string | null;
  atualizadoPor: string | null;
}

export interface ChamadosConfig {
  urlPublica: string | null;
  diasAutoResolucao: number | null;
  atualizadoEm: string | null;
  atualizadoPor: string | null;
}

export interface ArquivoTransferenciaAdmin {
  id: string;
  nomeOriginal: string;
  tipoMime: string;
  tamanhoBytes: number;
}

export interface TransferenciaAdmin {
  id: string;
  token: string;
  arquivos: ArquivoTransferenciaAdmin[];
  tamanhoTotalBytes: number;
  mensagem: string | null;
  enviadoPorUsuarioId: string;
  enviadoPorNome: string | null;
  destinatarioEmail: string | null;
  emailEnviado: boolean;
  criadoEm: string;
  expiraEm: string;
}

export interface EmpresaComCatalogo {
  codEmpresa: string;
  totalItens: number;
  ultimaSincronizacao: string | null;
}

export interface ItemMateriaPrimaCache {
  codigo: string;
  descricao: string;
  descricaoResumida: string;
  unidadeMedida: string | null;
}

export interface ItensMateriaPrimaCachePaginados {
  itens: ItemMateriaPrimaCache[];
  totalRegistros: number;
  totalPaginas: number;
}

export interface LogSincronizacaoMateriaPrima {
  id: string;
  codEmpresa: string;
  iniciadoEm: string;
  finalizadoEm: string | null;
  status: "sucesso" | "erro" | "em_andamento" | "cancelado";
  totalItens: number | null;
  mensagemErro: string | null;
  disparadoPor: string | null;
}
