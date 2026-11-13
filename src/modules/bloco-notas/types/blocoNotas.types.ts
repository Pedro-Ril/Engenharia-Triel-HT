/* Espelho de src/lib/bloco-notas/bloco-notas.ts. */

export interface PaginaResumo {
  id: string;
  paiId: string | null;
  titulo: string;
  favorita: boolean;
  ordem: number;
  atualizadoEm: string;
}

export interface Pagina extends PaginaResumo {
  conteudo: string;
  versao: number;
  criadoEm: string;
}

export interface PaginaLixeira {
  id: string;
  titulo: string;
  excluidaEm: string;
  subpaginas: number;
}

export interface ResultadoBusca {
  id: string;
  titulo: string;
  trecho: string | null;
}

export interface NoArvore extends PaginaResumo {
  filhos: NoArvore[];
}
