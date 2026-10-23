/* Máquina ligada à operação no ERP (TROT_FAB_MAQ). */
export type RecursoRoteiro = {
  COD_RECURSO: string;
  DESC_RECURSO?: string | null;
  PREFERENCIAL?: number | null;
};

/* Componente da estrutura consumido na operação (TCONSUMOS). */
export type ConsumoRoteiro = {
  COD_ITEM: string;
  DESC_ITEM?: string | null;
  SEQ_ORD: number;
  PER_CONSUMO: number;
};

export type RoteiroItem = {
  /* Só vêm pela API v2 (GET /v2/roteiro/:codItem). */
  ROTEIRO_ID?: number;
  ALTERNATIVO_NUM?: number;
  RECURSOS?: RecursoRoteiro[];
  CONSUMOS?: ConsumoRoteiro[];
  EMPR_ID?: number;
  COD_ITEM: string;
  ALTERNATIVO?: string;
  SEQ?: number;
  COD_OPERACAO?: number;
  DESC_OPERACAO?: string;
  COD_CENTRO_TRAB?: string;
  DESC_CENTRO_TRAB?: string;
  DT_INICIO?: string;
  DT_FIM?: string;
  APONTAMENTO?: number;
  OBRIGATORIO?: number;
  COD_UNID_MED?: string;
  DESC_UNID_MED?: string;
  TEMPO?: number | null;
  OBSERVACAO?: string | null;
};

export type RoteiroApiResponse = {
  success: boolean;
  codItem: string;
  total: number;
  data: RoteiroItem[];
};

export type Estrutura3DXNode = {
  tipo?: string;
  tipoint?: string;
  physicalId?: string;
  codigo?: string;
  id3DX?: string;
  title?: string;
  revisao?: string;
  descricao?: string;
  responsavel?: string;
  status?: string;
  owner?: string;
  collaborativeSpace?: string;
  criadoEm?: string;
  modificadoEm?: string;
  nivel?: number;
  instancia?: {
    physicalId?: string;
    nome?: string;
    ordem?: string;
    matriz?: string;
    /* "SynchroEBOMExt" = fora da lista de materiais (ver lib/estrutura-3dx). */
    kind?: string | null;
  } | null;
  children?: Estrutura3DXNode[];
};

export type Estrutura3DXResponse = {
  success: boolean;
  codigo: string;
  physicalId: string;
  item: {
    physicalId: string;
    codigo: string;
    id3DX: string;
    titulo: string;
    revisao: string;
    estado: string;
    descricao: string;
    tipo: string;
  };
  data: {
    total: number;
    totalItens: number;
    totalInstancias: number;
    tree: Estrutura3DXNode;
  };
};

export type RoteiroTreeNode = Omit<Estrutura3DXNode, "children"> & {
  id: string;
  codigoNormalizado: string;
  descricaoNormalizada: string;
  roteiros: RoteiroItem[];
  children: RoteiroTreeNode[];
  /*
   * Tipo do item no cadastro do ERP (TP_ITEM), lido só para quem chegou
   * do 3DX sem `tipoint` (ex.: revisão ainda em trabalho). Fica num
   * campo à parte de propósito: a conferência da estrutura usa o
   * `tipoint` bruto, e este é só para a tela classificar e filtrar.
   */
  tipoErp?: string;
};

/*
 * Estrutura do item no ERP, como a v2 devolve junto do roteiro -- é a
 * base para escolher os consumos. `consumidoEm` diz em que operações
 * aquele componente já é consumido (e quanto).
 */
export type ComponenteEstrutura = {
  cod_item: string;
  descricao: string | null;
  seq_ord: number;
  qtde: number | null;
  vigente: boolean;
  consumidoEm: { alternativo: number; seq: number; per_consumo: number }[];
};

/* Máquina ativa que pode ser recurso de uma operação (GET /v2/recursos). */
export type RecursoDisponivel = {
  COD_RECURSO: string;
  DESC_RECURSO: string | null;
  COD_CENTRO_TRAB: string | null;
  DESC_CENTRO_TRAB: string | null;
};

/* Como o formulário guarda recursos e consumos enquanto a pessoa edita. */
export type RecursoForm = {
  codRecurso: string;
  descricao: string;
  preferencial: boolean;
};

export type ConsumoForm = {
  codItem: string;
  descricao: string;
  seqOrd: number;
  /* Texto: a pessoa pode digitar com vírgula. */
  perConsumo: string;
};

/*
 * Um pai do item no ERP (implosão: onde o item é usado). Vem de
 * GET /api/v2/estrutura/:codItem/pais.
 */
export type PaiErp = {
  COD_ITEM_PAI: string;
  DESC_TECNICA_PAI: string | null;
  SEQ_ORD: number | null;
  QTDE: number | null;
  DT_INI: string | null;
  DT_FIM: string | null;
  STATUS_VALIDADE: "VALIDO" | "INVALIDO";
};
