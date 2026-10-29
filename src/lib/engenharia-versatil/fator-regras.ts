/*
 * Regras do fator de conversão para KG -- puras (testadas em
 * fator-regras.test.ts). Quem consulta/grava no ERP é fator-conversao.ts.
 *
 * Sentido da taxa no ERP (FITE0112): 1 unidade de DESTINO = TAXA unidades
 * de ORIGEM. Destino é sempre KG e a origem é a unidade de estoque do
 * item, então a taxa certa é 1 / peso líquido (peso 0,11 kg -> 1 KG =
 * 9,0909 UN).
 *
 * O peso que vale é o líquido do ERP, quando bate com o da planilha.
 * Divergente (ou ERP sem peso): a linha fica destacada e desmarcada; se o
 * usuário marcar, a taxa usa o peso da PLANILHA.
 */

import { normalizarNome, type AbaLida } from "./separacao-regras";

export const UNIDADE_DESTINO = "KG";
/* A planilha tem 3 casas e o ERP 4: 1,104 x 1,1035 é o mesmo peso. */
export const TOLERANCIA_PESO_KG = 0.001;
/* Taxa já cadastrada que difere até 0,1% da certa conta como certa. */
export const TOLERANCIA_TAXA = 0.001;

export interface ItemPlanilhaPeso {
  codigo: string;
  aba: string;
  pesoPlanilha: number | null;
  /* O código aparece em mais de uma aba com pesos diferentes. */
  conflito?: boolean;
}

export interface ItemErpFator {
  codigo: string;
  unidEstoque: string | null;
  pesoLiq: number | null;
  /* Conversão unidade de estoque -> KG já cadastrada. */
  conversaoKg: { id: number; taxa: number } | null;
}

export type SituacaoFator =
  | "incluir"
  | "alterar"
  | "ok"
  | "peso_divergente"
  | "erp_sem_peso"
  | "planilha_sem_peso"
  | "estoque_kg"
  /* Item sem cadastro de estoque no ERP: não há unidade de origem, o ERP recusaria (e derrubaria o lote). */
  | "sem_unidade"
  /* O mesmo código com pesos diferentes em abas da planilha: não dá para saber qual vale. */
  | "planilha_conflito"
  | "nao_encontrado";

export interface LinhaFator {
  codigo: string;
  aba: string;
  unidEstoque: string | null;
  pesoPlanilha: number | null;
  pesoErp: number | null;
  conversaoId: number | null;
  taxaAtual: number | null;
  situacao: SituacaoFator;
  /* O que acontece se a linha for marcada (null = nada a fazer). */
  operacao: "incluir" | "alterar" | null;
  taxaProposta: number | null;
  origemPeso: "erp" | "planilha" | null;
  marcavel: boolean;
  marcadoPorPadrao: boolean;
}

/* Um item por código (a primeira aba em que aparece), fora das abas da blacklist. */
export function itensDaPlanilha(abas: AbaLida[], blacklist: string[]): ItemPlanilhaPeso[] {
  const bloqueadas = new Set(blacklist.map(normalizarNome));
  const vistos = new Map<string, ItemPlanilhaPeso>();
  for (const aba of abas) {
    if (bloqueadas.has(normalizarNome(aba.aba))) continue;
    for (const lista of aba.listas) {
      for (const codigo of lista.codigos) {
        const atual = vistos.get(codigo);
        const peso = lista.pesos[codigo] ?? null;
        if (!atual) vistos.set(codigo, { codigo, aba: aba.aba, pesoPlanilha: peso });
        else if (atual.pesoPlanilha === null && peso !== null) atual.pesoPlanilha = peso;
        else if (atual.pesoPlanilha !== null && peso !== null && Math.abs(atual.pesoPlanilha - peso) > TOLERANCIA_PESO_KG + 1e-9) {
          atual.conflito = true;
        }
      }
    }
  }
  return [...vistos.values()];
}

function taxaBate(atual: number, certa: number): boolean {
  return Math.abs(atual - certa) <= certa * TOLERANCIA_TAXA;
}

function positivo(valor: number | null): valor is number {
  return valor !== null && valor > 0;
}

export function classificarFator(item: ItemPlanilhaPeso, erp: ItemErpFator | undefined): LinhaFator {
  const base: LinhaFator = {
    codigo: item.codigo,
    aba: item.aba,
    unidEstoque: erp?.unidEstoque ?? null,
    pesoPlanilha: item.pesoPlanilha,
    pesoErp: erp?.pesoLiq ?? null,
    conversaoId: erp?.conversaoKg?.id ?? null,
    taxaAtual: erp?.conversaoKg?.taxa ?? null,
    situacao: "ok",
    operacao: null,
    taxaProposta: null,
    origemPeso: null,
    marcavel: false,
    marcadoPorPadrao: false,
  };

  if (!erp) return { ...base, situacao: "nao_encontrado" };
  if (!erp.unidEstoque?.trim()) return { ...base, situacao: "sem_unidade" };
  if (normalizarNome(erp.unidEstoque) === UNIDADE_DESTINO) return { ...base, situacao: "estoque_kg" };
  if (item.conflito) return { ...base, situacao: "planilha_conflito" };
  if (!positivo(item.pesoPlanilha)) return { ...base, situacao: "planilha_sem_peso" };

  const pesoBate = positivo(erp.pesoLiq) && Math.abs(erp.pesoLiq - item.pesoPlanilha) <= TOLERANCIA_PESO_KG + 1e-9;
  const peso = pesoBate ? erp.pesoLiq! : item.pesoPlanilha;
  const taxa = 1 / peso;
  const situacaoProblema: SituacaoFator = positivo(erp.pesoLiq) ? "peso_divergente" : "erp_sem_peso";

  const jaCerta = erp.conversaoKg !== null && taxaBate(erp.conversaoKg.taxa, taxa);
  const operacao = jaCerta ? null : erp.conversaoKg ? "alterar" : "incluir";
  const comProposta = { ...base, taxaProposta: taxa, origemPeso: pesoBate ? ("erp" as const) : ("planilha" as const) };

  if (pesoBate) {
    if (!operacao) return { ...comProposta, situacao: "ok" };
    return { ...comProposta, situacao: operacao, operacao, marcavel: true, marcadoPorPadrao: true };
  }
  /* Divergente / ERP sem peso: só grava se o usuário marcar, com o peso da planilha. */
  return { ...comProposta, situacao: situacaoProblema, operacao, marcavel: operacao !== null, marcadoPorPadrao: false };
}

export function classificarFatores(itens: ItemPlanilhaPeso[], erp: Map<string, ItemErpFator>): LinhaFator[] {
  return itens.map((item) => classificarFator(item, erp.get(item.codigo)));
}
