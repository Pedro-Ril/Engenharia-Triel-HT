export interface WikiArtigoResumo {
  id: string;
  titulo: string;
  moduloId: string | null;
  moduloNome: string | null;
  topicoId: string | null;
  topicoNome: string | null;
  privadoAdmin: boolean;
  ativo: boolean;
  ordem: number;
  autorNome: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

export interface WikiArtigo extends WikiArtigoResumo {
  conteudo: string;
}

export interface WikiTopico {
  id: string;
  nome: string;
  icone: string | null;
  criadoEm: string;
}
