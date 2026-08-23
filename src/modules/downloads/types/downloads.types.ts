export interface DownloadPublico {
  id: string;
  nome: string;
  descricao: string;
  tag: string | null;
  nomeArquivo: string;
  tamanhoBytes: number;
  instrucoes: string[];
  funcionamento: string[];
}

export interface DownloadAdmin extends DownloadPublico {
  ordem: number;
  ativo: boolean;
  criadoEm: string;
  atualizadoEm: string;
  criadoPor: string | null;
}
