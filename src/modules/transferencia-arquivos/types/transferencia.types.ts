export interface ArquivoTransferencia {
  id: string;
  nomeOriginal: string;
  tipoMime: string;
  tamanhoBytes: number;
}

export interface Transferencia {
  id: string;
  token: string;
  arquivos: ArquivoTransferencia[];
  tamanhoTotalBytes: number;
  mensagem: string | null;
  enviadoPorUsuarioId: string;
  destinatarioEmail: string | null;
  emailEnviado: boolean;
  criadoEm: string;
  expiraEm: string;
}

export interface TransferenciaCriada extends Transferencia {
  linkDownload: string;
  avisoEmail: string | null;
}
