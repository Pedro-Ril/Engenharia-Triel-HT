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
}

export interface Empresa {
  id: string;
  nome: string;
  codigo: string | null;
  corPrimariaClara: string;
  corPrimariaEscura: string;
  ativa: boolean;
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
