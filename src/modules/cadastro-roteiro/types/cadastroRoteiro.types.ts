export type RoteiroItem = {
  EMPR_ID?: number;
  COD_ITEM: string;
  ALTERNATIVO?: string;
  SEQ?: number;
  COD_OPERACAO?: number;
  DESC_OPERACAO?: string;
  COD_CENTRO_TRAB?: string;
  DESC_CENTRO_TRAB?: string;
  DT_INICIO?: string;
  DT_FIM?: string;
  APONTAMENTO?: number;
  OBRIGATORIO?: number;
  COD_UNID_MED?: string;
  DESC_UNID_MED?: string;
  TEMPO?: number | null;
  OBSERVACAO?: string | null;
};

export type RoteiroApiResponse = {
  success: boolean;
  codItem: string;
  total: number;
  data: RoteiroItem[];
};

export type Estrutura3DXNode = {
  tipo?: string;
  tipoint?: string;
  physicalId?: string;
  codigo?: string;
  id3DX?: string;
  title?: string;
  revisao?: string;
  descricao?: string;
  responsavel?: string;
  status?: string;
  owner?: string;
  collaborativeSpace?: string;
  criadoEm?: string;
  modificadoEm?: string;
  nivel?: number;
  instancia?: {
    physicalId?: string;
    nome?: string;
    ordem?: string;
    matriz?: string;
  } | null;
  children?: Estrutura3DXNode[];
};

export type Estrutura3DXResponse = {
  success: boolean;
  codigo: string;
  physicalId: string;
  item: {
    physicalId: string;
    codigo: string;
    id3DX: string;
    titulo: string;
    revisao: string;
    estado: string;
    descricao: string;
    tipo: string;
  };
  data: {
    total: number;
    totalItens: number;
    totalInstancias: number;
    tree: Estrutura3DXNode;
  };
};

export type RoteiroTreeNode = Omit<Estrutura3DXNode, "children"> & {
  id: string;
  codigoNormalizado: string;
  descricaoNormalizada: string;
  roteiros: RoteiroItem[];
  children: RoteiroTreeNode[];
};