/* Espelho de src/lib/bloco-notas/bloco-notas.ts e compartilhamento.ts. */

export type PermissaoPagina = "dono" | "editar" | "ver";

export interface PaginaResumo {
  id: string;
  paiId: string | null;
  titulo: string;
  favorita: boolean;
  ordem: number;
  atualizadoEm: string;
  /* Aberta diretamente para alguém (ícone na árvore do dono). */
  compartilhada: boolean;
}

export interface Pagina extends PaginaResumo {
  conteudo: string;
  versao: number;
  criadoEm: string;
  /* De quem abriu: dono, ou o que o compartilhamento dá (editar/ver). */
  permissao: PermissaoPagina;
  donoNome: string;
  /* Aberta para alguém (ela ou uma página acima) -> edição ao vivo. */
  compartilhada: boolean;
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

export interface Compartilhamento {
  usuarioId: string;
  nome: string;
  email: string | null;
  permissao: "ver" | "editar";
}

export interface PaginaCompartilhadaComigo {
  id: string;
  paiId: string | null;
  titulo: string;
  ordem: number;
  atualizadoEm: string;
  donoNome: string;
  permissao: "ver" | "editar";
}

export interface PessoaParaCompartilhar {
  id: string;
  nome: string;
  email: string | null;
  departamento: string | null;
}

export interface PasseColaboracao {
  token: string;
  porta: number;
  podeEditar: boolean;
  pessoa: { nome: string; cor: string };
}
