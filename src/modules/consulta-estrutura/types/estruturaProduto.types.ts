export interface EstruturaApiItem {
  ID_ESTRUTURA?: number | null;
  ORDEM_HIERARQUICA?: string | null;
  NIVEL?: number | null;
  ESTRUTURA_VISUAL?: string | null;
  COD_EMP?: number | null;
  COD_ITEM_PAI_RAIZ?: string | null;
  DESC_TECNICA_PAI_RAIZ?: string | null;
  COD_ITEM_PAI?: string | null;
  DESC_TECNICA_PAI?: string | null;
  COD_ITEM_FILHO?: string | null;
  DESC_TECNICA_FILHO?: string | null;
  SEQ_ORD?: number | null;
  DT_INI?: string | null;
  DT_FIM?: string | null;
  QTDE?: number | null;
  QTDE_CORRIGIDA?: number | null;
  TP_PERDA?: string | null;
  STATUS_VALIDADE?: string | null;
  CAMINHO_ESTRUTURA?: string | null;
}

export type EstruturaApiResponse = {
  success: boolean;
  codItemPai: string;
  total: number;
  data: EstruturaApiItem[];
};

export type EstruturaTreeNode = {
  id: string;
  codigo: string;
  descricao: string;
  nivel: number;
  caminho: string;
  children: EstruturaTreeNode[];
  registros: EstruturaApiItem[];
  statusValidade?: string;
  parentCode?: string;
};

export type EstruturaConsultaResultado = {
  codItemPai: string;
  descricaoPai: string;
  total: number;
  data: EstruturaApiItem[];
};

export type EstruturaDeleteInvalidadosResponse = {
  success: boolean;
  message: string;
  codItemPai: string;
  recebidos: number[];
  totalRecebidos: number;
  totalEncontrados: number;
  totalDeletados: number;
  deletados: EstruturaApiItem[];
  naoEncontrados: number[];
  bloqueados: EstruturaApiItem[];
};

export type EstruturaDeleteInvalidadosLoteRequest = {
  codItemPaiRaiz: string;
  grupos: {
    codPaiDireto: string;
    ids: number[];
  }[];
};

export type EstruturaDeleteInvalidadosLoteGrupoDetalhe = {
  codPaiDireto: string;
  totalRecebidos: number;
  totalEncontrados?: number;
  totalDeletados?: number;
  totalDeletaveis?: number;
  totalBloqueados?: number;
  recebidos?: number[];
  naoEncontrados?: number[];
  bloqueados?: EstruturaApiItem[];
  deletados?: EstruturaApiItem[];
  deletaveis?: EstruturaApiItem[];
  status: "sucesso" | "falha_validacao";
};

export type EstruturaDeleteInvalidadosLoteResponse = {
  success: boolean;
  message: string;
  codItemPaiRaiz: string;
  committed: boolean;
  rollbackExecutado: boolean;
  resumo: {
    totalGruposRecebidos: number;
    totalIdsRecebidos?: number;
    totalEncontrados?: number;
    totalDeletados?: number;
    grupoComFalha?: string;
  };
  detalhesGrupos: EstruturaDeleteInvalidadosLoteGrupoDetalhe[];
};