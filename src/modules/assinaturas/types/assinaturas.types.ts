export type FonteAssinatura = "Metropolis" | "Metropolis Bold" | "Montserrat" | "Montserrat Bold";

export interface CampoAssinaturaConfig {
  x: number;
  y: number;
  tamanhoPx: number;
  fonte: FonteAssinatura;
  cor: string;
}

export interface CampoSobrenomeConfig extends CampoAssinaturaConfig {
  seguirNome: boolean;
  espacamentoAposNomePx: number;
}

export interface CamposAssinaturaConfig {
  nome: CampoAssinaturaConfig;
  sobrenome: CampoSobrenomeConfig;
  setor: CampoAssinaturaConfig;
  email: CampoAssinaturaConfig;
  celular: CampoAssinaturaConfig;
}

export interface ModeloAssinatura {
  id: string;
  nome: string;
  imagemLargura: number;
  imagemAltura: number;
  camposConfig: CamposAssinaturaConfig;
  ativo: boolean;
  ordem: number;
}

export interface ModeloAssinaturaAdmin extends ModeloAssinatura {
  criadoEm: string;
  criadoPor: string | null;
  atualizadoEm: string;
  atualizadoPor: string | null;
}

export interface AssinaturaGerada {
  id: string;
  modeloId: string | null;
  modeloNome: string;
  usuarioId: string;
  usuarioNome: string;
  nome: string;
  sobrenome: string;
  setor: string;
  email: string;
  celular: string | null;
  nomeArquivo: string;
  criadoEm: string;
  atualizadoEm: string | null;
}

export type EventoLogAssinatura = "criacao" | "edicao" | "download" | "exclusao";

export interface ItemLogAssinatura {
  id: string;
  evento: EventoLogAssinatura;
  usuarioNome: string;
  modeloNome: string | null;
  assinaturaNome: string;
  quando: string;
}

export interface ValoresFormularioAssinatura {
  nome: string;
  sobrenome: string;
  setor: string;
  email: string;
  celular: string;
}
