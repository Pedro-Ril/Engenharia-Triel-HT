import type { TipoAprovacao } from "@/lib/aprovacoes/tipos-aprovacao";

/* "devolvido": algum nível da alçada devolveu ao solicitante (pode reenviar). */
export type StatusAprovacao = "pendente" | "aprovado" | "reprovado" | "devolvido";
/* Fonte única: src/lib/aprovacoes/tipos-aprovacao.ts (client-safe). */
export type { TipoAprovacao } from "@/lib/aprovacoes/tipos-aprovacao";

/*
 * Um lote (solicitação) contém vários colaboradores -- cada um
 * decidido individualmente pela direção. Por isso status/decisão
 * vivem no ITEM, não no lote (que só guarda quem criou, quando, e a
 * observação compartilhada por todos os itens).
 */
export interface ItemAumentoSalarial {
  id: string;
  aprovacaoId: string;
  aprovacaoNumero: number;
  /* De que tipo de aprovação este item é -- o painel atende vários. */
  tipo: TipoAprovacao;
  /* Observação do LOTE inteiro, compartilhada por todos os colaboradores. */
  observacaoGeral: string | null;
  criadoPorUsuarioId: string;
  criadoPorNome: string;
  criadoEm: string;
  funcionarioCodigo: string;
  funcionarioNome: string;
  funcionarioCpf: string | null;
  departamento: string | null;
  setor: string | null;
  /* "YYYY-MM-DD" -- data de admissão do colaborador no RH, congelada na criação. */
  dataAdmissao: string | null;
  salarioAtual: number;
  valorReajuste: number;
  percentualReajuste: number;
  novoSalario: number;
  /* Preenchidos só quando a direção ajustou os valores antes de decidir -- é o que o solicitante tinha pedido. NULL = não houve alteração. */
  valorReajusteOriginal: number | null;
  percentualReajusteOriginal: number | null;
  novoSalarioOriginal: number | null;
  /* Observação SÓ deste colaborador. */
  observacao: string | null;
  status: StatusAprovacao;
  decididoPorNome: string | null;
  decididoEm: string | null;
  comentarioDecisao: string | null;
  resumoTitulo: string;
  /* Último envio do relatório da SOLICITAÇÃO (repetido em cada item dela). */
  relatorioEnviado: { em: string; por: string; para: string } | null;
  /* É a vez de quem está vendo decidir (o nível pendente é o dele). */
  naMinhaVez: boolean;
  /* Pendente: em que nível da alçada está. */
  nivelAtual: NivelAtual | null;
  /* Só no detalhe: a cadeia e o histórico. */
  fluxo?: { etapas: EtapaAprovacao[]; historico: EventoHistoricoAprovacao[] };
}

export interface AprovacaoLote {
  id: string;
  numero: number;
  tipo: TipoAprovacao;
  observacao: string | null;
  criadoPorUsuarioId: string;
  criadoPorNome: string;
  criadoEm: string;
  itens: ItemAumentoSalarial[];
}

export interface FuncionarioRh {
  codigo: string;
  nome: string;
  departamento: string | null;
  setor: string | null;
}

export interface DetalheAtualFuncionario {
  salarioAtual: number;
  cpf: string | null;
  dataAdmissao: string | null;
}

/* Pedido de compra do Focco na fila do diretor (aba Pedidos de Compra do painel). */
export interface PedidoCompraPainel {
  id: string;
  numeroAprovacao: number;
  /* empr_id do Focco. */
  empresa: number;
  empresaNome: string;
  /* cod_pedc do Focco. */
  numero: number;
  status: StatusAprovacao;
  enviadoPor: string;
  enviadoEm: string;
  observacao: string | null;
  /* Diretor escolhido pelo comprador; null = qualquer um da empresa. */
  aprovadorNome: string | null;
  decididoPor: string | null;
  decididoEm: string | null;
  comentario: string | null;
  /* Foto do ERP no envio (null quando o ERP não respondeu ou em envios antigos). */
  fornecedorNome: string | null;
  compradorNome: string | null;
  valorTotal: number | null;
  moeda: string | null;
  /* ISO (YYYY-MM-DD). */
  dataEmissao: string | null;
  situacaoErp: string | null;
  quantidadeItens: number | null;
  /* Resumo das parcelas ("30/60 dias", "À vista"). */
  condicaoPagamento: string | null;
  /* Primeira entrega entre os itens, ISO. */
  entregaPrevista: string | null;
  temFoto: boolean;
  /* Código do centro de custo dos itens, sem repetir; null = ainda não sabemos. */
  centrosCusto: string[] | null;
  /* É a vez de quem está vendo decidir (o nível pendente é o dele). */
  naMinhaVez: boolean;
  /* Pendente: em que nível da alçada está. */
  nivelAtual: NivelAtual | null;
  /*
   * Na vez de quem está vendo: para onde vai ao aprovar, pela sugestão da
   * regra (pessoa null = todos do próximo nível). null = quem vê é o
   * último nível. Ausente fora da vez.
   */
  vaiPara?: { proximoNivel: string; pessoa: { id: string; nome: string } | null } | null;
}

export interface NivelAtual {
  ordem: number;
  total: number;
  nome: string;
  /* O nível foi direcionado a esta pessoa (só ela decide). */
  direcionadoPara: string | null;
}

/* aguardando: o nível ainda não chegou | encerrado: o ciclo acabou antes (devolução). */
export type StatusEtapa = "aguardando" | "pendente" | "aprovado" | "devolvido" | "encerrado";

/* Um nível da cadeia do envio atual, como a tela mostra. */
export interface EtapaAprovacao {
  ciclo: number;
  ordem: number;
  nivelNome: string;
  status: StatusEtapa;
  decididoPor: string | null;
  decididoEm: string | null;
  comentario: string | null;
  aprovadores: string[];
  /* Direcionado a uma pessoa do nível: só ela decide. */
  direcionadoPara: string | null;
}

export type AcaoHistoricoAprovacao = "enviado" | "reenviado" | "aprovado_nivel" | "aprovado" | "devolvido" | "direcionado";

export interface PessoaDoNivel {
  id: string;
  nome: string;
}

/* Ao aprovar: para quem o próximo nível pode ir, e quem a regra da alçada sugere. */
export interface DirecionamentoDaVez {
  itemId: string;
  proximoNivel: string;
  opcoes: PessoaDoNivel[];
  /* null = todos do nível. */
  sugestao: PessoaDoNivel | null;
}

export interface EventoHistoricoAprovacao {
  acao: AcaoHistoricoAprovacao;
  ciclo: number | null;
  nivelNome: string | null;
  usuarioNome: string | null;
  comentario: string | null;
  criadoEm: string;
  numeroAprovacao?: number;
}

export interface FluxoPedidoCompra {
  etapas: EtapaAprovacao[];
  historico: EventoHistoricoAprovacao[];
  rodadas: { numeroAprovacao: number; enviadoEm: string; status: string }[];
}

/* Situação do pedido no Focco (calculada pela API do ERP a partir da posição e do saldo). */
export type SituacaoPedidoErp = "pendente" | "parcial" | "atendido" | "cancelado";

export interface ParcelaPedidoErp {
  parcela: number;
  dias: number | null;
  vencimento: string | null;
  percentual: number | null;
  /* false = o ERP não tem percentual e dividiu o total igualmente. */
  percentualInformado: boolean;
  valorEstimado: number | null;
}

export interface ItemPedidoErp {
  sequencia: number;
  codigo: string;
  descricao: string;
  unidade: string | null;
  situacao: string | null;
  quantidade: number;
  atendida: number;
  saldo: number;
  precoUnitario: number;
  percentualIpi: number | null;
  total: number;
  entrega: string | null;
  centroCusto: string | null;
  /* Código do centro de custo (ex.: "9002204") -- para as sugestões de direcionamento. */
  centroCustoCodigo: string | null;
  observacao: string | null;
}

/* Pedido de compra como o portal mostra -- normalizado a partir da resposta da API do ERP. */
export interface PedidoCompraErp {
  numero: number;
  empresa: { codigo: number; nome: string | null };
  dataEmissao: string | null;
  situacao: SituacaoPedidoErp | string | null;
  tipo: string | null;
  fornecedor: { codigo: number | null; nome: string; documento: string | null };
  comprador: string | null;
  contato: string | null;
  /* null quando é real. */
  moeda: string | null;
  frete: { tipo: string | null; valor: number | null; transportadora: string | null } | null;
  parcelas: ParcelaPedidoErp[];
  valores: {
    bruto: number;
    descontos: number;
    acrescimos: number;
    ipi: number;
    icms: number;
    icmsSt: number;
    frete: number;
    total: number;
  };
  observacao: string | null;
  itens: ItemPedidoErp[];
}
