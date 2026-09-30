export type TipoBusca = "lote" | "ordem";

/*
 * O endpoint do TuBest devolve a mesma estrutura do endpoint do Lantek
 * (é a mesma exportação do Focco, com outras restrições no SQL). Só os
 * campos usados aqui estão tipados: a peça, a quantidade e o que
 * identifica a ordem na conferência.
 */
export interface ApiIntegracaoItem {
  num_lote_pro: number | null;
  num_ordem: number | null;

  cod_item: string | null;
  cod_desenho: string | null;
  desc_tecnica: string | null;
  qtde: number | null;

  /* Matéria-prima do item -- só para conferência; a planilha do TuBest
     tem as três colunas fixas do modelo. */
  cod_item_mp: string | null;
  desc_tecnica_mp: string | null;
  qtde_mp: number | null;
  cod_unid_med_mp: string | null;

  num_pedido: number | null;
  descricao_cli: string | null;
}

export interface ApiIntegracaoResponse {
  value: ApiIntegracaoItem[];
}

/* O .igs é exceção: só é usado quando a peça não tem STEP. */
export type FormatoArquivo = "step" | "igs";

export interface StepValidacaoResultado {
  codigo: string;
  existe: boolean;
  duplicado: boolean;
  caminho: string;
  arquivo: string;
  caminhos: string[];
  formato: FormatoArquivo | "";
}

export interface ValidacaoStepResposta {
  total: number;
  semStep: number;
  duplicados: number;
  resultados: StepValidacaoResultado[];
}

/* O que a tela sabe de cada código depois da conferência na pasta. */
export interface StepInfo {
  existe: boolean;
  duplicado: boolean;
  caminho: string;
  arquivo: string;
  caminhos: string[];
  formato: FormatoArquivo | "";
}

/* Uma linha da planilha final: caminho (A), código (B) e quantidade (C).
   O código da MP viaja junto só para separar os arquivos -- ele não vai
   para nenhuma coluna. */
export interface LinhaExportacao {
  caminho: string;
  codigo: string;
  quantidade: number | "";
  codigoMp: string;
}
