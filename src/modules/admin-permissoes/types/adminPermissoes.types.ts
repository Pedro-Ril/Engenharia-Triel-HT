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
