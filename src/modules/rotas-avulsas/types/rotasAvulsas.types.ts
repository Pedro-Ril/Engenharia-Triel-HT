/* Espelho dos tipos de src/lib/rotas-avulsas (que é server-only). */

export interface ApiEnvelope<T> {
  ok: boolean;
  message?: string;
  data?: T;
}

export type ResultadoLog = "aceito" | "recusado" | "erro";
export type SituacaoToken = "ativo" | "expirado" | "revogado";

export interface ConfigRotaAvulsa {
  chave: string;
  ativo: boolean;
  limitePorSegundo: number;
  rajada: number;
  limitePorMinuto: number;
  config: Record<string, unknown>;
  atualizadoEm: string | null;
  atualizadoPor: string | null;
}

export interface EscopoToken {
  impressoras?: string[];
}

export interface TokenRotaAvulsa {
  id: string;
  rotaChave: string;
  nome: string;
  prefixo: string;
  escopo: EscopoToken;
  expiraEm: string | null;
  revogadoEm: string | null;
  revogadoPor: string | null;
  ultimoUsoEm: string | null;
  ultimoIp: string | null;
  totalUsos: number;
  criadoEm: string;
  criadoPor: string;
  situacao: SituacaoToken;
}

export interface LogRotaAvulsa {
  id: string;
  tokenId: string | null;
  tokenNome: string | null;
  ipOrigem: string | null;
  metodo: string;
  caminho: string;
  statusHttp: number;
  resultado: ResultadoLog;
  motivo: string | null;
  detalhes: unknown;
  duracaoMs: number | null;
  criadoEm: string;
}

export interface PaginaLogs {
  itens: LogRotaAvulsa[];
  total: number;
  pagina: number;
  porPagina: number;
  resumo24h: { aceitos: number; recusados: number; erros: number };
}

export interface Impressora {
  id: string;
  codigo: string;
  nome: string;
  endereco: string;
  porta: number;
  caminhoIpp: string;
  usarTls: boolean;
  certificadoSha256: string | null;
  frenteVersoPadrao: boolean;
  ativo: boolean;
  criadoEm: string;
  atualizadoEm: string | null;
  atualizadoPor: string | null;
}

export type DadosImpressora = Omit<Impressora, "id" | "criadoEm" | "atualizadoEm" | "atualizadoPor">;

export interface SituacaoImpressora {
  modelo: string | null;
  estado: "ociosa" | "imprimindo" | "parada" | "desconhecido";
  motivos: string[];
  mensagem: string | null;
  aceitandoTrabalhos: boolean | null;
  aceitaPdf: boolean;
  frenteVersoSuportado: boolean;
  validacao: { ok: boolean; detalhe: string };
}

export interface CertificadoImpressora {
  sha256: string;
  assunto: string | null;
  validoAte: string | null;
}
