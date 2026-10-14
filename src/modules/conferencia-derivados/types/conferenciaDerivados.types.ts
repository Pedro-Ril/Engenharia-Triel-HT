import type { TipoArquivoDerivado } from "../constants/tipos-arquivo";

export interface ResultadoTipo {
  tipo: TipoArquivoDerivado;
  pasta: string;
  /* Arquivos daquele tipo encontrados na pasta (todas as subpastas). */
  totalArquivosNaPasta: number;
  encontrados: number;
  faltando: string[];
  /*
   * Preenchido quando a pasta não pôde ser lida ou não está
   * configurada. Aí NENHUM código é dado como faltando: sem conseguir
   * ler a pasta, "faltando" seria um alarme falso.
   */
  erro: string | null;
}

export interface ResultadoConferencia {
  totalCodigos: number;
  tipos: ResultadoTipo[];
  duracaoMs: number;
}
