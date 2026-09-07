export type ApprovalStatus =
  | "rascunho"
  | "em_aprovacao"
  | "pendente"
  | "aprovado"
  | "reprovado";

export type ApprovalRepresentation =
  | "lateral"
  | "superior"
  | "completo";

export type RevisionStatus =
  | "gerando"
  | "gerado"
  | "em_aprovacao"
  | "ajustes_solicitados"
  | "aprovado"
  | "reprovado"
  | "erro";

export type FlowAction =
  | "gerar"
  | "aprovar"
  | "solicitar-ajustes"
  | "reprovar"
  | "reabrir-revisao";

export interface ApprovalHistoryItem {
  id: string;
  desenhoId: string;

  acao: string;

  statusAnterior: ApprovalStatus | null;
  statusNovo: ApprovalStatus | null;

  observacao: string | null;
  dados: unknown;

  usuario: string | null;
  criadoEm: string;
}

export interface ApprovalRevision {
  id: string;

  numeroRevisao: number;
  codigoRevisao: string;
  statusRevisao: RevisionStatus;

  templateCodigo: string | null;
  templateVersao: number | null;
  geradorVersao: string | null;

  possuiSvg: boolean;
  possuiPdf: boolean;

  criadoEm: string;
  criadoPor: string | null;

  geradoEm: string | null;
  geradoPor: string | null;

  enviadoAprovacaoEm: string | null;
  enviadoAprovacaoPor: string | null;

  decididoEm: string | null;
  decididoPor: string | null;

  observacaoDecisao: string | null;
}

export interface ApprovalProject {
  id?: string;

  numero?: string;

  cliente: string;

  produto: string;

  modelo: string;

  caminhao: string;

  cabine: string;

  comprimento: number;

  altura: number;

  capacidadeTon: number;

  volumeM3: number;

  compartimentos: number;

  peso: number;

  cargaDianteira: number;

  cargaTraseira: number;

  observacoes: string;

  status?: ApprovalStatus;

  tipoRepresentacao?: ApprovalRepresentation;

  dataEmissao?: string;

  previsaoAprovacao?: string;

  incluirCotas?: boolean;

  calculoAutomatico?: boolean;

  incluirCaminhao?: boolean;

  criadoEm?: string;

  atualizadoEm?: string;
}

export const initialApprovalProject: ApprovalProject = {
  cliente: "",
  produto: "",
  modelo: "",
  caminhao: "",
  cabine: "",

  comprimento: 0,
  altura: 0,
  capacidadeTon: 0,
  volumeM3: 0,
  compartimentos: 0,
  peso: 0,
  cargaDianteira: 0,
  cargaTraseira: 0,

  observacoes: "",

  status: "rascunho",
  tipoRepresentacao: "completo",

  dataEmissao: "",
  previsaoAprovacao: "",

  incluirCotas: true,
  calculoAutomatico: true,
  incluirCaminhao: false,
};