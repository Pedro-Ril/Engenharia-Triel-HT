export type TemaPreferencia = "claro" | "escuro" | "sistema";

export interface PerfilUsuario {
  samAccountName: string;
  nomeExibicao: string;
  email: string | null;
  codigoEmpresa: string | null;
  ehAdministrador: boolean;
  ultimoLoginEm: string | null;
  tema: TemaPreferencia;
}

export interface TentativaLoginHistorico {
  id: string;
  sucesso: boolean;
  motivoFalha: string | null;
  ipOrigem: string | null;
  criadoEm: string;
}

export interface AcessoModuloResumo {
  moduloId: string;
  moduloNome: string;
  moduloIcone: string | null;
  totalAcessos: number;
  ultimoAcesso: string | null;
}

export interface MinhaContaData {
  perfil: PerfilUsuario;
  historico: TentativaLoginHistorico[];
  acessosModulos: AcessoModuloResumo[];
}
