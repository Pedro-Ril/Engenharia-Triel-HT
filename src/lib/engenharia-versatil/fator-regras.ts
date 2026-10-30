/*
 * Regras do fator de conversão para KG -- puras (testadas em
 * fator-regras.test.ts). Quem consulta/grava no ERP é fator-conversao.ts.
 *
 * Sentido da taxa no ERP (FITE0112): 1 unidade de DESTINO = TAXA unidades
 * de ORIGEM. Destino é sempre KG e a origem é a unidade de estoque do
 * item, então a taxa certa é 1 / peso líquido (peso 0,11 kg -> 1 KG =
 * 9,0909 UN).
 *
 * O que decide é o fator. O peso vale o líquido do ERP quando bate com o
 * da planilha; ERP sem peso usa o da planilha, normalmente. Peso
 * divergente (o ERP tem outro peso): a linha fica destacada e desmarcada;
 * se o usuário marcar, a taxa usa o peso da PLANILHA. Planilha sem peso
 * não tem como calcular: só aviso.
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
  /* Peso bruto (só o ajuste de peso usa: para manter a proporção bruto/líquido). */
  pesoBrt?: number | null;
  /* Conversão unidade de estoque -> KG já cadastrada. */
  conversaoKg: { id: number; taxa: number } | null;
}

export type SituacaoFator =
  | "incluir"
  | "alterar"
  | "ok"
  | "peso_divergente"
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

/*
 * Um item por código (a primeira aba em que aparece), só das abas do
 * fator (ex.: CHAPARIA) e nunca da blacklist. Sem abas do fator
 * configuradas, entram todas as abas fora da blacklist.
 */
export function itensDaPlanilha(abas: AbaLida[], blacklist: string[], abasFator: string[] = []): ItemPlanilhaPeso[] {
  const bloqueadas = new Set(blacklist.map(normalizarNome));
  const permitidas = new Set(abasFator.map(normalizarNome));
  const vistos = new Map<string, ItemPlanilhaPeso>();
  for (const aba of abas) {
    const nome = normalizarNome(aba.aba);
    if (bloqueadas.has(nome) || (permitidas.size > 0 && !permitidas.has(nome))) continue;
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

export function classificarFator(item: ItemPlanilhaPeso, erp: ItemErpFator | undefined, pesoConfirmado?: number): LinhaFator {
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

  /*
   * O que decide é o fator. ERP sem peso não é problema: vale o peso da
   * planilha. Só o peso DIVERGENTE (o ERP tem outro peso) pede atenção.
   */
  const temPesoErp = positivo(erp.pesoLiq);
  const divergente = temPesoErp && Math.abs(erp.pesoLiq! - item.pesoPlanilha) > TOLERANCIA_PESO_KG + 1e-9;
  const usaPesoErp = temPesoErp && !divergente;
  const taxa = 1 / (usaPesoErp ? erp.pesoLiq! : item.pesoPlanilha);

  const jaCerta = erp.conversaoKg !== null && taxaBate(erp.conversaoKg.taxa, taxa);
  const operacao = jaCerta ? null : erp.conversaoKg ? "alterar" : "incluir";
  const comProposta = { ...base, taxaProposta: taxa, origemPeso: usaPesoErp ? ("erp" as const) : ("planilha" as const) };

  if (!divergente) {
    if (!operacao) return { ...comProposta, situacao: "ok" };
    return { ...comProposta, situacao: operacao, operacao, marcavel: true, marcadoPorPadrao: true };
  }
  /*
   * Divergência já decidida: alguém usou "Ajustar peso" para o item e o
   * ERP está exatamente com o peso escolhido e o fator = 1 / esse peso.
   * Está resolvido (a planilha é que ficou diferente).
   */
  if (
    pesoConfirmado !== undefined &&
    Math.abs(pesoConfirmado - erp.pesoLiq!) <= 1e-6 &&
    erp.conversaoKg !== null &&
    taxaBate(erp.conversaoKg.taxa, 1 / erp.pesoLiq!)
  ) {
    return { ...base, situacao: "ok", taxaProposta: 1 / erp.pesoLiq!, origemPeso: "erp" };
  }
  /* Divergente: só grava se o usuário marcar, com o peso da planilha. */
  return { ...comProposta, situacao: "peso_divergente", operacao, marcavel: operacao !== null, marcadoPorPadrao: false };
}

/* `pesosConfirmados`: último peso gravado por "Ajustar peso" em cada código (mesma empresa e ambiente). */
export function classificarFatores(
  itens: ItemPlanilhaPeso[],
  erp: Map<string, ItemErpFator>,
  pesosConfirmados: Map<string, number> = new Map()
): LinhaFator[] {
  return itens.map((item) => classificarFator(item, erp.get(item.codigo), pesosConfirmados.get(item.codigo)));
}

/* ------------------------------------------------------------------ ajuste de peso */

/* O bruto do ERP costuma ser 1,1 x líquido (vem da importação do 3DX). */
export const FATOR_BRUTO_PADRAO = 1.1;

/*
 * Ao corrigir o peso líquido: se o bruto de hoje segue a proporção padrão
 * (1,1 x líquido, com folga de 0,5%), o bruto acompanha o novo líquido; se
 * não segue (foi digitado à mão), o bruto não é tocado.
 */
export function manterProporcaoBruta(pesoLiq: number | null, pesoBrt: number | null | undefined): boolean {
  if (pesoLiq === null || pesoLiq <= 0 || pesoBrt === null || pesoBrt === undefined || pesoBrt <= 0) return false;
  const esperado = pesoLiq * FATOR_BRUTO_PADRAO;
  return Math.abs(pesoBrt - esperado) <= esperado * 0.005;
}

/* De onde veio o peso escolhido pelo usuário (para o registro). */
export function origemDoPeso(peso: number, pesoPlanilha: number | null, pesoErp: number | null): "planilha" | "erp" | "digitado" {
  const igual = (a: number | null) => a !== null && Math.abs(a - peso) <= 1e-9;
  if (igual(pesoPlanilha)) return "planilha";
  if (igual(pesoErp)) return "erp";
  return "digitado";
}
