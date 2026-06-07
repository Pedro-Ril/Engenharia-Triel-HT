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