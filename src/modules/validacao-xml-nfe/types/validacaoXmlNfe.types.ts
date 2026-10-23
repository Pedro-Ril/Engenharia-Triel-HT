export type Severidade = "erro" | "aviso";

/*
 * Pelo bloco do veículo: "valido" = nota autorizada pela SEFAZ, com o
 * veicProd em todo item de veículo e sem recusa do schema. Qualquer outra
 * coisa é "invalido". Avisos da conferência interna não mudam a situação.
 */
export type SituacaoNota = "valido" | "invalido";

/*
 * "sefaz": regra do schema oficial -- a SEFAZ rejeitaria a nota.
 * "conferencia": checagem nossa (o veicProd faltando, chassi do texto
 * diferente da tag...), que a SEFAZ não faz.
 */
export type OrigemApontamento = "sefaz" | "conferencia";

export interface Apontamento {
  severidade: Severidade;
  origem: OrigemApontamento;
  mensagem: string;
  /* Item da nota (nItem) a que o apontamento se refere, quando houver. */
  item?: number;
}

export interface CampoVeiculo {
  tag: string;
  rotulo: string;
  /* Valor exatamente como veio (sem cortar espaços: o schema conta eles). */
  valor: string;
  presente: boolean;
  /* Valor traduzido pela tabela do layout ("14" -> "Caminhão"), quando houver. */
  significado?: string;
  /* A regra do schema da SEFAZ para o campo, e por que o valor não passa nela. */
  regra: string;
  motivoRecusa: string | null;
}

export interface ItemNota {
  numeroItem: number;
  codigo: string;
  descricao: string;
  ncm: string;
  cfop: string;
  quantidade: string;
  valor: number | null;
  pedido: string;
  textoAdicional: string;
  /* Item de veículo: tem veicProd, NCM de veículo (8701-8705) ou chassi no texto. */
  ehVeiculo: boolean;
  /* Campos do veicProd; null quando o grupo não veio. */
  veiculo: CampoVeiculo[] | null;
  /* O que o texto livre do item (infAdProd) diz -- para comparar com as tags. */
  noTexto: {
    chassi: string;
    motor: string;
    carroceria: string;
  };
}

export interface NotaValidada {
  arquivo: string;
  situacao: SituacaoNota;
  apontamentos: Apontamento[];
  numero: string;
  serie: string;
  chave: string;
  emissao: string;
  naturezaOperacao: string;
  emitente: { nome: string; cnpj: string };
  destinatario: { nome: string; documento: string; uf: string };
  valorTotal: number | null;
  protocolo: { status: string; motivo: string; numero: string; data: string } | null;
  pesoVolumes: { liquido: number | null; bruto: number | null };
  informacoesComplementares: string;
  itens: ItemNota[];
}

export interface FalhaLeitura {
  arquivo: string;
  mensagem: string;
}

export type ResultadoArquivo =
  | { tipo: "nota"; nota: NotaValidada }
  | { tipo: "falha"; falha: FalhaLeitura };

/* Histórico: a situação da nota, ou "falha" quando o XML nem pôde ser lido. */
export type SituacaoRegistro = SituacaoNota | "falha";

export interface RegistroValidacao {
  id: string;
  usuarioNome: string;
  arquivo: string;
  numeroNota: string | null;
  serie: string | null;
  chaveAcesso: string | null;
  destinatario: string | null;
  situacao: SituacaoRegistro;
  qtdErros: number;
  qtdAvisos: number;
  apontamentos: string[];
  criadoEm: string;
}
