export interface ItemMateriaPrima {
  codigo: string;
  descricao: string;
  descricaoResumida: string;
  unidadeMedida: string | null;
}

export interface ItensMateriaPrimaData {
  itens: ItemMateriaPrima[];
  ultimaSincronizacao: string | null;
}

export interface DeParaMateriaPrima {
  id: string;
  codEmpresa: string;
  codItemOrigem: string;
  descItemOrigem: string | null;
  codItemDestino: string;
  descItemDestino: string | null;
  observacao: string;
  ativo: boolean;
  criadoPor: string;
  criadoEm: string;
}
