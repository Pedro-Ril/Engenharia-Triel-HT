export type StatusAprovacao = "pendente" | "aprovado" | "reprovado";
export type TipoAprovacao = "aumento_salarial";

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
}
