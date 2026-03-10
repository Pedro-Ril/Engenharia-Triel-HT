export type EstruturaApiItem = {
  ORDEM_HIERARQUICA: string;
  NIVEL: number;
  ESTRUTURA_VISUAL: string;
  COD_EMP: number;
  COD_ITEM_PAI_RAIZ: string;
  DESC_TECNICA_PAI_RAIZ: string;
  COD_ITEM_PAI: string;
  DESC_TECNICA_PAI: string;
  COD_ITEM_FILHO: string;
  DESC_TECNICA_FILHO: string;
  SEQ_ORD: number;
  DT_INI: string | null;
  DT_FIM: string | null;
  QTDE: number;
  QTDE_CORRIGIDA: number;
  TP_PERDA: string;
  STATUS_VALIDADE: string;
  CAMINHO_ESTRUTURA: string;
};

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