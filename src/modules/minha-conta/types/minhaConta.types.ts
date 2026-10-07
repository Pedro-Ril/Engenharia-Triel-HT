import type { ModoGestos } from "@/modules/visualizador-cad/constants/gestos";

export type TemaPreferencia = "claro" | "escuro" | "sistema";

export interface PerfilUsuario {
  samAccountName: string;
  nomeExibicao: string;
  email: string | null;
  codigoEmpresa: string | null;
  ehAdministrador: boolean;
  ultimoLoginEm: string | null;
  tema: TemaPreferencia;
  /* Modo de gestos do mouse no Visualizador CAD. */
  gestosCad: ModoGestos;
  /* Falso esconde o cartão de gestos: a pessoa não abre esse módulo. */
  podeVisualizadorCad: boolean;
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
