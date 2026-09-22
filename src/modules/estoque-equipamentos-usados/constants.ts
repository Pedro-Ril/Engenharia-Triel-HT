import type { Equipamento } from "./types/estoque.types";

/*
 * Espelha as chaves reservadas dos 10 campos fixos do sistema definidas
 * em src/lib/estoque-equipamentos-usados/tipos-equipamento.ts (que não
 * pode ser importado por componentes client — usa "server-only"). Mesmo
 * padrão de tipos espelhados já usado em types/estoque.types.ts.
 */
export const CHAVE_SISTEMA_NOME_CLIENTE = "sistemaNomeCliente";
export const CHAVE_SISTEMA_VALOR = "sistemaValor";
export const CHAVE_SISTEMA_DESCRICAO = "sistemaDescricao";
export const CHAVE_SISTEMA_MARCA = "sistemaMarca";
export const CHAVE_SISTEMA_MODELO = "sistemaModelo";
export const CHAVE_SISTEMA_NUMERO_SERIE = "sistemaNumeroSerie";
export const CHAVE_SISTEMA_CODIGO_EMPRESA = "sistemaCodigoEmpresa";
export const CHAVE_SISTEMA_NUMERO_NF_ENTRADA = "sistemaNumeroNfEntrada";
export const CHAVE_SISTEMA_ERP_CODIGO_ITEM = "sistemaErpCodigoItem";
export const CHAVE_SISTEMA_ID_CONFIGURADO = "sistemaIdConfigurado";
export const CHAVE_SISTEMA_DATA_ENTRADA_NF = "sistemaDataEntradaNf";
export const CHAVE_SISTEMA_OBSERVACOES = "sistemaObservacoes";

/*
 * Pseudo-chave derivada (não é um campo de sistema de verdade) — estado
 * "NF de entrada digitada, mas ainda não confirmada pela integração com
 * o ERP". Ver mesma constante em
 * src/lib/estoque-equipamentos-usados/tipos-equipamento.ts.
 */
export const CHAVE_PENDENCIA_NF_AGUARDANDO_VALIDACAO = `${CHAVE_SISTEMA_NUMERO_NF_ENTRADA}AguardandoValidacao`;

export const CHAVES_SISTEMA_SEMPRE_OBRIGATORIAS: string[] = [CHAVE_SISTEMA_DESCRICAO];

/*
 * Sentinela de configuração (não é uma chave de campo de verdade) — usada
 * só no de-para de "mascara" da integração de NF de entrada, pra indicar
 * "use o Nº sequencial do próprio equipamento" em vez do valor de um
 * campo de sistema. Ver OPCOES_CAMPO_MASCARA_NF.
 */
export const CHAVE_MASCARA_NUMERO_SEQUENCIAL = "numeroSequencial";

/*
 * Opções pro de-para de "mascara" (o Focco chama de número do carro) na
 * consulta de NF de entrada — configurável em Administração → Equipamentos
 * Usados → Integração ERP. Compartilhado entre o painel admin (client) e
 * o job (server-only), por isso mora aqui e não em nf-entrada-integracao.ts.
 * "Número (sequencial)" é o valor mais provável (é literalmente sequencial,
 * como o Focco descreve), por isso é o padrão.
 */
export const OPCOES_CAMPO_MASCARA_NF: { chave: string; rotulo: string }[] = [
  { chave: CHAVE_MASCARA_NUMERO_SEQUENCIAL, rotulo: "Número (sequencial)" },
  { chave: CHAVE_SISTEMA_NUMERO_SERIE, rotulo: "Número de série" },
  { chave: CHAVE_SISTEMA_MARCA, rotulo: "Marca" },
  { chave: CHAVE_SISTEMA_MODELO, rotulo: "Modelo" },
  { chave: CHAVE_SISTEMA_NOME_CLIENTE, rotulo: "Cliente" },
];

/* Mesmo formato usado pelo CurrencyInput — consistente com o campo mascarado. */
export function formatarMoeda(valor: number | null): string {
  if (valor === null) return "-";
  return `R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/*
 * Rótulo padrão de cada campo de sistema — usado pelo admin pra rotular
 * o botão de "restaurar" quando um deles foi excluído (o rótulo real só
 * existe depois de restaurado; antes disso só existe esse padrão).
 */
export const ROTULO_PADRAO_CAMPO_SISTEMA: Record<string, string> = {
  [CHAVE_SISTEMA_NOME_CLIENTE]: "Cliente",
  [CHAVE_SISTEMA_VALOR]: "Valor",
  [CHAVE_SISTEMA_DESCRICAO]: "Descrição",
  [CHAVE_SISTEMA_MARCA]: "Marca",
  [CHAVE_SISTEMA_MODELO]: "Modelo",
  [CHAVE_SISTEMA_NUMERO_SERIE]: "Número de série",
  [CHAVE_SISTEMA_CODIGO_EMPRESA]: "Empresa",
  [CHAVE_SISTEMA_NUMERO_NF_ENTRADA]: "NF de entrada",
  [CHAVE_SISTEMA_ERP_CODIGO_ITEM]: "Código do item no ERP",
  [CHAVE_SISTEMA_ID_CONFIGURADO]: "ID Configurado",
  [CHAVE_SISTEMA_DATA_ENTRADA_NF]: "Data Entrada NF",
  [CHAVE_SISTEMA_OBSERVACOES]: "Observações livres",
};

/*
 * Campos de sistema com texto longo (rótulo/dica extensa ou textarea) —
 * ficam sozinhos numa linha de largura total no formulário de entrada,
 * em vez de disputar espaço numa coluna estreita da grade.
 */
export const CHAVES_SISTEMA_LARGURA_TOTAL: string[] = [CHAVE_SISTEMA_DESCRICAO, CHAVE_SISTEMA_OBSERVACOES];

export const TODAS_CHAVES_SISTEMA: string[] = [
  CHAVE_SISTEMA_NOME_CLIENTE,
  CHAVE_SISTEMA_VALOR,
  CHAVE_SISTEMA_DESCRICAO,
  CHAVE_SISTEMA_MARCA,
  CHAVE_SISTEMA_MODELO,
  CHAVE_SISTEMA_NUMERO_SERIE,
  CHAVE_SISTEMA_CODIGO_EMPRESA,
  CHAVE_SISTEMA_NUMERO_NF_ENTRADA,
  CHAVE_SISTEMA_ERP_CODIGO_ITEM,
  CHAVE_SISTEMA_ID_CONFIGURADO,
  CHAVE_SISTEMA_DATA_ENTRADA_NF,
  CHAVE_SISTEMA_OBSERVACOES,
];

/*
 * "gera_pendencia" só cobre campo de sistema (o valor mora numa coluna
 * dedicada do equipamento) — este switch decide, por chave, se aquele
 * campo está vazio numa linha específica, pra montar o badge/filtro de
 * pendência na lista de estoque.
 */
export function campoSistemaEstaVazio(equipamento: Equipamento, chave: string): boolean {
  switch (chave) {
    case CHAVE_SISTEMA_NOME_CLIENTE:
      return !equipamento.nomeCliente;
    case CHAVE_SISTEMA_VALOR:
      return equipamento.valor === null;
    case CHAVE_SISTEMA_MARCA:
      return !equipamento.marca;
    case CHAVE_SISTEMA_MODELO:
      return !equipamento.modelo;
    case CHAVE_SISTEMA_NUMERO_SERIE:
      return !equipamento.numeroSerie;
    case CHAVE_SISTEMA_CODIGO_EMPRESA:
      return !equipamento.codigoEmpresa;
    case CHAVE_SISTEMA_NUMERO_NF_ENTRADA:
      return !equipamento.numeroNfEntrada;
    case CHAVE_SISTEMA_ERP_CODIGO_ITEM:
      return !equipamento.erpCodigoItem;
    case CHAVE_SISTEMA_ID_CONFIGURADO:
      return !equipamento.erpIdItem;
    case CHAVE_SISTEMA_DATA_ENTRADA_NF:
      return !equipamento.erpDataEntrada;
    case CHAVE_SISTEMA_OBSERVACOES:
      return !equipamento.observacoes;
    default:
      return false;
  }
}

/*
 * Mesmo critério usado pra liberar empréstimo/consignação
 * (registrarMovimentacao, no servidor) e pro card "Dados de Integração"
 * do detalhe — NF de entrada só conta como confirmada quando os 3
 * campos que vêm da integração (código do item, ID configurado, data de
 * entrada) também estão preenchidos, não só o número digitado.
 */
export function nfEntradaIntegradaComErp(
  equipamento: Pick<Equipamento, "numeroNfEntrada" | "erpCodigoItem" | "erpIdItem" | "erpDataEntrada">
): boolean {
  return Boolean(
    equipamento.numeroNfEntrada &&
      equipamento.erpCodigoItem &&
      equipamento.erpIdItem &&
      equipamento.erpDataEntrada
  );
}
