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
  ativo: boolean;
  ordem: number;
}

export interface PortalUsuarioAdmin {
  id: string;
  samAccountName: string;
  nomeExibicao: string;
  email: string | null;
  codigoEmpresa: string | null;
  ehAdministrador: boolean;
  ativo: boolean;
  sessaoInvalidadaEm: string | null;
  ultimoLoginEm: string | null;
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
