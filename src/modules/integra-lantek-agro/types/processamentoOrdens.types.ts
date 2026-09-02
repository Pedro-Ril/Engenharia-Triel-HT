export type TipoBusca = "lote" | "ordem";

export interface ApiIntegracaoItem {
  num_lote_pro: number | null;
  num_rancho: number | null;
  num_ordem: number | null;

  cod_item: string | null;
  cod_desenho: string | null;
  desc_tecnica: string | null;
  qtde: number | null;

  cod_item_mp: string | null;
  desc_tecnica_mp: string | null;

  qtde_mp: number | null;
  cod_unid_med_mp: string | null;

  num_pedido: number | null;
  cod_cli: string | null;
  descricao_cli: string | null;

  cod_operacao: number | null;
  descricao_operacao: string | null;

  cod_centrotrab: string | null;
  descricao_centrotrab: string | null;

  cod_maquina: string | null;
  descricao_maquina: string | null;
}

export interface ApiIntegracaoResponse {
  value: ApiIntegracaoItem[];
}

export interface TabelaProcessamentoRow {
  id: string;

  numLote: string;
  numOrdem: string;

  codItem: string;
  codDesenho: string;
  descTecnica: string;
  qtde: number | "";

  codItemMp: string;
  descTecnicaMp: string;
  qtdeMp: number | "";
  codUnidMp: string;

  material: string;
  espessura: string;

  operacao: string;
  maquina: string;

  cliente: string;
  pdv: string;

  dxfExiste: boolean | null;
  dxfCaminho: string;
  dxfDuplicado: boolean;
  dxfCaminhos: string[];
}

export interface DxfValidacaoResultado {
  codigo: string;
  codDesenho: string;
  codigoUsado: string;
  origem: "codigo" | "cod_desenho" | "";
  existe: boolean;
  duplicado: boolean;
  caminho: string;
  arquivo: string;
  caminhos: string[];
}