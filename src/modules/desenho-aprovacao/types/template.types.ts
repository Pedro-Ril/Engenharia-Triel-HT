export type StatusTemplate = "ativo" | "arquivado";
export type StatusVersaoTemplate = "rascunho" | "em_teste" | "publicado" | "arquivado";
export type TipoDadoCampo = "texto" | "numero" | "booleano" | "data";
export type CategoriaCampo =
  | "identificacao"
  | "cliente"
  | "produto"
  | "dimensoes"
  | "capacidade"
  | "cargas"
  | "revisao"
  | "auditoria"
  | "outro";

export interface Template {
  id: string;
  codigo: string;
  nome: string;
  descricao: string | null;
  formatoPapel: string;
  orientacao: "horizontal" | "vertical";
  larguraMm: number;
  alturaMm: number;
  status: StatusTemplate;
  versaoPublicadaId: string | null;
  criadoEm: string;
  criadoPor: string;
  atualizadoEm: string;
  atualizadoPor: string;
}

export type ValorGeometria =
  | number
  | { tipo: "campo"; campo: string; fatorMm: number; deslocamentoMm: number };

export type BordaAncoragem = "esquerda" | "direita" | "topo" | "base" | "centro";

export type ValorPosicao =
  | number
  | { tipo: "ancorado"; elementoId: string; borda: BordaAncoragem; deslocamentoMm: number };

interface ElementoBase {
  id: string;
  nome?: string;
  ordem: number;
  visivel: boolean;
  bloqueado: boolean;
  opacidade: number;
  rotacaoGraus: number;
}

export interface PreenchimentoElemento {
  cor: string;
  opacidade?: number;
}

export interface BordaElemento {
  cor: string;
  espessuraMm: number;
  estilo?: "solido" | "tracejado" | "pontilhado";
}

export interface ElementoRetangulo extends ElementoBase {
  tipo: "retangulo";
  xMm: ValorPosicao;
  yMm: ValorPosicao;
  larguraMm: ValorGeometria;
  alturaMm: ValorGeometria;
  raioBordaMm: number;
  preenchimento: PreenchimentoElemento | null;
  borda: BordaElemento | null;
}

export type OrigemCota =
  | { modo: "limites_elemento"; elementoId: string }
  | { modo: "manual"; inicioMm: ValorGeometria; fimMm: ValorGeometria };

export interface EstiloFonteCota {
  familiaFonte: string;
  tamanhoFonteMm: number;
  cor: string;
}

export interface ElementoCota extends ElementoBase {
  tipo: "cota";
  orientacao: "horizontal" | "vertical";
  origem: OrigemCota;
  campoMedida?: string;
  obrigatorio?: boolean;
  deslocamentoMm: number;
  extensaoMm: number;
  tamanhoSetaMm: number;
  espessuraMm: number;
  corLinha: string;
  corTexto: string;
  fonte: EstiloFonteCota;
  unidade: string;
  casasDecimais: number;
  prefixo?: string;
  sufixo?: string;
  textoAcimaDaLinha: boolean;
}

export interface EstiloTexto {
  familiaFonte: string;
  tamanhoFonteMm: number;
  pesoFonte: "normal" | "bold";
  cor: string;
  alinhamentoHorizontal: "esquerda" | "centro" | "direita";
  alinhamentoVertical: "topo" | "meio" | "base";
  alturaLinha?: number;
  espacamentoLetrasMm?: number;
  italico?: boolean;
  sublinhado?: boolean;
}

export interface ElementoTextoDinamico extends ElementoBase {
  tipo: "texto_dinamico";
  xMm: ValorPosicao;
  yMm: ValorPosicao;
  campo: string;
  obrigatorio?: boolean;
  valorPadrao?: string;
  prefixo?: string;
  sufixo?: string;
  formato?: string;
  unidade?: string;
  ocultarQuandoVazio: boolean;
  estiloTexto: EstiloTexto;
}

export interface ElementoImagemSvg extends ElementoBase {
  tipo: "imagem_svg";
  xMm: ValorPosicao;
  yMm: ValorPosicao;
  larguraMm: ValorGeometria;
  alturaMm: ValorGeometria;
  assetId: string;
  ajuste: "conter" | "preencher";
}

export type TemplateElemento =
  | ElementoRetangulo
  | ElementoCota
  | ElementoTextoDinamico
  | ElementoImagemSvg;

export interface PaginaConfig {
  formato: string;
  orientacao: "horizontal" | "vertical";
  larguraMm: number;
  alturaMm: number;
  unidade: "mm";
  margemSeguraMm: number;
  corFundo: string;
}

export interface TemplateJson {
  schemaVersion: 1;
  pagina: PaginaConfig;
  elementos: TemplateElemento[];
}

export interface TemplateVersao {
  id: string;
  templateId: string;
  numeroVersao: number;
  status: StatusVersaoTemplate;
  templateJson: TemplateJson;
  svgPreview: string | null;
  observacao: string | null;
  criadoEm: string;
  criadoPor: string;
  atualizadoEm: string;
  atualizadoPor: string;
  publicadoEm: string | null;
  publicadoPor: string | null;
  arquivadoEm: string | null;
  arquivadoPor: string | null;
}

export interface CampoDinamico {
  id: string;
  chave: string;
  rotulo: string;
  categoria: CategoriaCampo;
  tipoDado: TipoDadoCampo;
  formatoPadrao: string | null;
  unidadePadrao: string | null;
  valorExemplo: string | null;
  descricao: string | null;
  ordem: number;
  ativo: boolean;
}

export interface VinculoTemplate {
  id: string;
  templateId: string;
  produto: string;
  modelo: string | null;
  padrao: boolean;
  prioridade: number;
  vigenciaInicio: string | null;
  vigenciaFim: string | null;
  ativo: boolean;
}

export interface AssetTemplate {
  id: string;
  escopo: "global" | "template" | "versao";
  templateId: string | null;
  versaoId: string | null;
  nome: string;
  tipo: string;
  mimeType: string;
  tamanhoBytes: number;
  hashSha256: string;
  larguraPx: number | null;
  alturaPx: number | null;
  viewbox: string | null;
  svgSanitizado: boolean;
  ativo: boolean;
  criadoEm: string;
  criadoPor: string;
}

export interface CampoExtraTemplate {
  chave: string;
  rotulo: string;
  tipoDado: TipoDadoCampo;
  unidadePadrao: string | null;
  obrigatorio: boolean;
}

export interface BoundsResolvidos {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}
