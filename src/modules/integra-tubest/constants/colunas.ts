import type { ApiIntegracaoItem } from "../types/integraTubest.types";

/*
 * Catálogo das colunas da tabela de peças.
 *
 * O endpoint devolve bem mais campo do que cabe numa tela, e o que
 * interessa muda conforme quem está usando. Em vez de escolher por
 * todo mundo, a tela mostra o conjunto PADRÃO e deixa a pessoa somar ou
 * tirar colunas -- a escolha fica guardada como preferência dela.
 *
 * Três colunas são fixas e não entram nessa escolha: a peça e a
 * descrição, que são o assunto da linha, e as ações. Sem elas a tabela
 * deixa de fazer sentido.
 *
 * Coluna nova: basta acrescentar aqui. A tela, o seletor e a
 * preferência salva passam a conhecê-la sozinhos -- preferência antiga
 * continua válida, porque chave desconhecida é descartada na leitura.
 */

/* Chave da preferência do usuário (ver portal_preferencias_usuario_modulo). */
export const CHAVE_PREFERENCIA_COLUNAS = "integra-tubest:colunas";

export type ChaveColuna =
  | "peca"
  | "descricao"
  | "qtde"
  | "lote"
  | "ordem"
  | "rancho"
  | "desenho"
  | "codigoMp"
  | "descricaoMp"
  | "qtdeMp"
  | "unidadeMp"
  | "pedido"
  | "cliente"
  | "operacao"
  | "centroTrabalho"
  | "maquina"
  | "operacaoOrdem"
  | "centroTrabalhoOrdem"
  | "maquinaOrdem"
  | "arquivo"
  | "acoes";

export type GrupoColuna = "Peça" | "Ordem" | "Matéria-prima" | "Roteiro" | "Ordem de fabricação" | "Arquivo";

export interface DefinicaoColuna {
  chave: ChaveColuna;
  label: string;
  grupo: GrupoColuna;
  alinhamento?: "left" | "right" | "center";
  /* Não pode ser desligada pelo usuário. */
  fixa?: boolean;
  /* Entra na configuração padrão da tela. */
  padrao?: boolean;
  /* Como o valor sai do item do endpoint. "" quando não se aplica. */
  valor?: (item: ApiIntegracaoItem) => string;
}

function texto(valor: unknown): string {
  const limpo = String(valor ?? "").trim();
  return limpo;
}

/* "1000 — USINAGEM": código e descrição juntos ocupam menos que duas colunas. */
function codigoComDescricao(codigo: unknown, descricao: unknown): string {
  const partes = [texto(codigo), texto(descricao)].filter(Boolean);
  return partes.join(" — ");
}

export const COLUNAS: DefinicaoColuna[] = [
  { chave: "peca", label: "Peça", grupo: "Peça", fixa: true, padrao: true },
  { chave: "descricao", label: "Descrição", grupo: "Peça", fixa: true, padrao: true },
  {
    chave: "qtde",
    label: "Qtde",
    grupo: "Peça",
    alinhamento: "right",
    padrao: true,
    valor: (item) => texto(item.qtde),
  },
  {
    chave: "desenho",
    label: "Cód. desenho",
    grupo: "Peça",
    valor: (item) => texto(item.cod_desenho),
  },

  { chave: "lote", label: "Lote", grupo: "Ordem", valor: (item) => texto(item.num_lote_pro) },
  { chave: "ordem", label: "Ordem", grupo: "Ordem", valor: (item) => texto(item.num_ordem) },
  { chave: "rancho", label: "Rancho", grupo: "Ordem", valor: (item) => texto(item.num_rancho) },
  { chave: "pedido", label: "Pedido", grupo: "Ordem", valor: (item) => texto(item.num_pedido) },
  {
    chave: "cliente",
    label: "Cliente",
    grupo: "Ordem",
    valor: (item) => codigoComDescricao(item.cod_cli, item.descricao_cli),
  },

  {
    chave: "codigoMp",
    label: "Cód. MP",
    grupo: "Matéria-prima",
    padrao: true,
    valor: (item) => texto(item.cod_item_mp),
  },
  {
    chave: "descricaoMp",
    label: "Descrição MP",
    grupo: "Matéria-prima",
    padrao: true,
    valor: (item) => texto(item.desc_tecnica_mp),
  },
  { chave: "qtdeMp", label: "Qtde MP", grupo: "Matéria-prima", alinhamento: "right", padrao: true },
  {
    chave: "unidadeMp",
    label: "Unidade MP",
    grupo: "Matéria-prima",
    valor: (item) => codigoComDescricao(item.cod_unid_med_mp, item.descricao_unid_med_m),
  },

  {
    chave: "operacao",
    label: "Operação",
    grupo: "Roteiro",
    valor: (item) => codigoComDescricao(item.cod_operacao, item.descricao_operacao),
  },
  {
    chave: "centroTrabalho",
    label: "Centro de trabalho",
    grupo: "Roteiro",
    valor: (item) => codigoComDescricao(item.cod_centrotrab, item.descricao_centrotrab),
  },
  {
    chave: "maquina",
    label: "Máquina",
    grupo: "Roteiro",
    valor: (item) => codigoComDescricao(item.cod_maquina, item.descricao_maquina),
  },

  {
    chave: "operacaoOrdem",
    label: "Operação (OF)",
    grupo: "Ordem de fabricação",
    valor: (item) => codigoComDescricao(item.cod_operacao_ordem, item.descricao_operacao_ordem),
  },
  {
    chave: "centroTrabalhoOrdem",
    label: "Centro de trabalho (OF)",
    grupo: "Ordem de fabricação",
    valor: (item) => codigoComDescricao(item.cod_centrotrab_ordem, item.descricao_centrotrab_ordem),
  },
  {
    chave: "maquinaOrdem",
    label: "Máquina (OF)",
    grupo: "Ordem de fabricação",
    valor: (item) => codigoComDescricao(item.cod_maquina_ordem, item.descricao_maquina_ordem),
  },

  { chave: "arquivo", label: "Arquivo STEP", grupo: "Arquivo", padrao: true },
  { chave: "acoes", label: "Ações", grupo: "Arquivo", alinhamento: "center", fixa: true, padrao: true },
];

export const COLUNAS_PADRAO: ChaveColuna[] = COLUNAS.filter((coluna) => coluna.padrao).map(
  (coluna) => coluna.chave
);

export const COLUNAS_FIXAS: ChaveColuna[] = COLUNAS.filter((coluna) => coluna.fixa).map(
  (coluna) => coluna.chave
);

export function definicaoDaColuna(chave: ChaveColuna): DefinicaoColuna | undefined {
  return COLUNAS.find((coluna) => coluna.chave === chave);
}

/*
 * Normaliza o que veio da preferência salva: descarta chave que não
 * existe mais, tira repetição e garante as fixas.
 *
 * A ORDEM da lista é a ordem das colunas na tela -- a pessoa arrasta
 * para mudar --, então ela é preservada como veio. As fixas que
 * faltarem entram onde fazem sentido: peça e descrição abrindo a
 * tabela, ações fechando.
 */
export function normalizarColunas(escolhidas: unknown): ChaveColuna[] {
  const lista = Array.isArray(escolhidas) ? escolhidas.map(String) : [];

  const validas = lista.filter((chave): chave is ChaveColuna =>
    COLUNAS.some((coluna) => coluna.chave === chave)
  );

  const semRepetir = [...new Set(validas)];

  /* Preferência vazia (ou só com chaves mortas) volta para o padrão. */
  const temAlgoAlemDasFixas = semRepetir.some((chave) => !COLUNAS_FIXAS.includes(chave));
  if (!temAlgoAlemDasFixas) return COLUNAS_PADRAO;

  const resultado = [...semRepetir];

  if (!resultado.includes("descricao")) resultado.unshift("descricao");
  if (!resultado.includes("peca")) resultado.unshift("peca");
  if (!resultado.includes("acoes")) resultado.push("acoes");

  return resultado;
}
