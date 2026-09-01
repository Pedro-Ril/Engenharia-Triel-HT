export interface ItemNivelEstrutura {
  codigo: string;
  descricao: string | null;
  sequencia: string;
  quantidade: number;
  dataInicial: string;
  dataFinal: string;
  codigoPai: string;
  descricaoPai: string | null;
}

export interface EstruturaCompleta {
  codigoRaiz: string;
  descricaoRaiz: string | null;
  itens: ItemNivelEstrutura[];
}

export interface ResultadoNivelSubstituicao {
  codigoPai: string;
  descricaoPai: string | null;
  sucesso: boolean;
  mensagemErro: string | null;
}

export interface ResultadoValidacaoItem {
  codigo: string;
  existeNoErp: boolean;
  possuiConversao: boolean;
}

export interface EmpresaEstruturaSubstituicao {
  id: string;
  nome: string;
  codigo: string | null;
}

export interface ConfigEstruturaSubstituicao {
  urlConsultaEstrutura: string | null;
  urlValidarItens: string | null;
  urlAtualizarEstrutura: string | null;
  urlConsultaEstruturaTeste: string | null;
  urlValidarItensTeste: string | null;
  urlAtualizarEstruturaTeste: string | null;
  usarAmbienteTeste: boolean;
  atualizadoEm: string | null;
  atualizadoPor: string | null;
}

export type AmbienteEstruturaSubstituicao = "producao" | "teste";

export interface HistoricoSubstituicaoItem {
  id: string;
  usuarioNome: string;
  empresaNome: string | null;
  ambiente: AmbienteEstruturaSubstituicao;
  codPai: string;
  codPaiRaiz: string | null;
  codigoAntigo: string;
  codigoNovo: string;
  sucesso: boolean;
  mensagemErro: string | null;
  payloadEnviado: string | null;
  criadoEm: string;
}

export interface HistoricoSubstituicaoPaginado {
  itens: HistoricoSubstituicaoItem[];
  total: number;
  totalPaginas: number;
}
