/*
 * Extrato unificado do equipamento: junta as movimentações do Portal com
 * as do ERP numa lista só (usado pela tela e pelo PDF do extrato).
 */
import type { AnexoMovimentacao, MovimentacaoEquipamento, MovimentoErpGravado } from "../types/estoque.types";
import { ACAO_LABELS, STATUS_BADGE, STATUS_LABELS } from "./rotulos";

export const LOCAL_LABEL: Record<string, { texto: string; variant: "success" | "info" | "neutral" | "warning" }> = {
  EM_ESTOQUE: { texto: "Em estoque", variant: "success" },
  EM_TERCEIRO: { texto: "Com terceiro", variant: "info" },
  FORA_DA_EMPRESA: { texto: "Fora da empresa", variant: "neutral" },
  SEM_MOVIMENTO: { texto: "Sem movimento", variant: "warning" },
};

export type Origem = "portal" | "erp" | "ambos";

export const ORIGEM: Record<Origem, { texto: string; variant: "neutral" | "info" | "success" }> = {
  portal: { texto: "Portal", variant: "neutral" },
  erp: { texto: "ERP", variant: "info" },
  ambos: { texto: "Portal + ERP", variant: "success" },
};

/* Uma linha do extrato: movimentação do Portal, do ERP, ou as duas casadas pela NF. */
export interface LinhaExtrato {
  chave: string;
  data: string;
  ordem: number;
  acao: string;
  detalheErp: string | null;
  origem: Origem;
  nf: string | null;
  cfop: number | null;
  naturezaOperacao: string | null;
  valor: number | null;
  emissao: string | null;
  comQuem: string | null;
  status: { texto: string; variant: "success" | "warning" | "info" | "neutral" | "danger" } | null;
  anexos: AnexoMovimentacao[];
  responsavel: string;
  cancelada: boolean;
}


function nfDoErp(m: MovimentoErpGravado): string | null {
  return m.nfNumero ? `${m.nfNumero}${m.nfSerie ? `/${m.nfSerie}` : ""}` : null;
}

/*
 * Junta o extrato do Portal com o do ERP numa lista só, em ordem de data:
 * - movimentação do Portal casada com uma do ERP (mesma NF) vira UMA linha,
 *   com a data, NF, CFOP e valores do ERP;
 * - o que só existe no ERP (ou só no Portal) aparece como linha própria.
 */
export function montarLinhas(
  movimentacoes: MovimentacaoEquipamento[],
  movimentosErp: MovimentoErpGravado[],
  anexosPorMovimentacao: Map<string, AnexoMovimentacao[]>
): LinhaExtrato[] {
  const erpPorId = new Map(movimentosErp.map((m) => [m.idMovimentacao, m]));
  const usados = new Set<string>();
  const linhas: LinhaExtrato[] = [];

  /* "NF de entrada vinculada" só repete a entrada; com a entrada já confirmada pelo ERP, não acrescenta nada. */
  const entradaConfirmada = movimentacoes.some((m) => m.tipoAcao === "entrada" && m.erpIdMovimentacao && erpPorId.has(m.erpIdMovimentacao));

  movimentacoes.forEach((mov, i) => {
    if (mov.tipoAcao === "nf_vinculada" && entradaConfirmada) return;
    const erp = mov.erpIdMovimentacao ? erpPorId.get(mov.erpIdMovimentacao) : undefined;
    if (erp) usados.add(erp.idMovimentacao);
    linhas.push({
      chave: mov.id,
      data: erp?.data ?? mov.dataAcao,
      ordem: i,
      acao: ACAO_LABELS[mov.tipoAcao],
      detalheErp: erp && erp.tipoLabel !== ACAO_LABELS[mov.tipoAcao] ? erp.tipoLabel : null,
      origem: mov.origem === "erp" ? "erp" : erp ? "ambos" : "portal",
      nf: erp ? nfDoErp(erp) : mov.numeroNf,
      cfop: erp?.cfop ?? null,
      naturezaOperacao: erp?.naturezaOperacao ?? null,
      valor: mov.valor ?? erp?.valorTotalItem ?? null,
      emissao: mov.dataEmissaoNf ?? erp?.nfDataEmissao ?? null,
      comQuem: mov.destinatarioNome ?? erp?.contraparteNome ?? null,
      status: { texto: STATUS_LABELS[mov.statusResultante], variant: STATUS_BADGE[mov.statusResultante] },
      anexos: anexosPorMovimentacao.get(mov.id) ?? [],
      responsavel: mov.criadoPorNome,
      cancelada: false,
    });
  });

  movimentosErp.forEach((m, i) => {
    if (usados.has(m.idMovimentacao)) return;
    const local = m.localDepois ? LOCAL_LABEL[m.localDepois] : null;
    linhas.push({
      chave: `erp:${m.idMovimentacao}`,
      data: m.data,
      ordem: movimentacoes.length + i,
      acao: m.tipoLabel,
      detalheErp: m.vendaDeConsignacao ? "de consignação" : null,
      origem: "erp",
      nf: nfDoErp(m),
      cfop: m.cfop,
      naturezaOperacao: m.naturezaOperacao,
      valor: m.valorTotalItem,
      emissao: m.nfDataEmissao,
      comQuem: m.contraparteNome,
      status: m.removido ? { texto: "NF cancelada no ERP", variant: "danger" } : local ? { texto: local.texto, variant: local.variant } : null,
      anexos: [],
      responsavel: "ERP",
      cancelada: m.removido,
    });
  });

  return linhas.sort((a, b) => a.data.localeCompare(b.data) || a.ordem - b.ordem);
}

