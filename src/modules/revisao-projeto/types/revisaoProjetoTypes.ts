export interface EstruturaNode {
  linhaExcel: number;

  nivel: number;
  nivelOriginal: string;

  codigo: string;
  descricao: string;

  quantidade: number | null;
  unidade: string;

  quantidadeOriginal: number | null;
  unidadeOriginal: string;

  pesoKg: number | null;

  mpConvertidaKg: boolean;
  pesoKgPaiImediato: number | null;

  codigoPaiImediato: string | null;
  descricaoPaiImediato: string | null;

  filhos: EstruturaNode[];

  codItemFocco?: string | null;
  descricaoFocco?: string | null;
  tpItemFocco?: string | null;
  codDesenhoPesquisado?: string | null;
  consultaFoccoRealizada?: boolean;

  opcoesFocco?: ItemFoccoOpcao[];
  precisaEscolherFocco?: boolean;
}

export interface AnaliseExcelResponse {
  success: boolean;
  message?: string;

  arquivo?: string;
  aba?: string;

  totalRaizes?: number;
  totalItens?: number;
  totalMpConvertidas?: number;

  estrutura?: EstruturaNode[];
}

export interface ItemFoccoApiItem {
  EMPR_ID: number;
  COD_ITEM: string;
  DESC_TECNICA: string;
  DESC_RESUM: string;
  COD_DESENHO: string;
  TP_ITEM: string;

  SIT_CAPA?: string;
  SIT_EMPR?: string;
  SIT_ENG?: string;
}

export interface ItemFoccoApiResponse {
  success: boolean;
  total: number;
  message?: string;
  filtros?: {
    empr_id: number;
    cod_item: string | null;
    cod_desenho: string | null;
  };
  data: ItemFoccoApiItem[];
}

export interface ItemFoccoOpcao {
  emprId: number;
  codItem: string;
  descTecnica: string;
  descResumo: string;
  codDesenho: string;
  tpItem: string;

  sitCapa?: string;
  sitEmpr?: string;
  sitEng?: string;
}

export interface ResultadoItemFocco {
  codDesenho: string;
  encontrado: boolean;

  codItemFocco: string | null;
  descricaoFocco: string | null;
  tpItemFocco: string | null;

  totalEncontrado: number;
  precisaEscolher: boolean;
  opcoes: ItemFoccoOpcao[];
}