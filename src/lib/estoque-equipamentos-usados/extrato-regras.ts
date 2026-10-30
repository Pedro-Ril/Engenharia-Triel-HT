/*
 * Regras da integração pelo EXTRATO do item no ERP -- puras, sem banco
 * nem rede (testadas em extrato-regras.test.ts). Quem chama a API e
 * grava é extrato-integracao.ts.
 *
 * O ERP classifica cada movimentação (COMPRA, CONSIGNACAO_REMESSA, ...)
 * pelo CFOP + tipo de NF + almoxarifado. Aqui isso vira:
 *  - a ação equivalente no extrato do Portal (emprestimo, consignacao,
 *    reforma, retorno, baixa, transferencia) -- ou nenhuma, para o que é
 *    só controle interno do ERP (ajuste de valor, inventário, requisição);
 *  - o status em que o equipamento fica depois dela.
 */

export type StatusPortal = "em_estoque" | "emprestado" | "consignado" | "em_reforma" | "baixado";
export type AcaoPortal = "entrada" | "emprestimo" | "consignacao" | "reforma" | "retorno" | "baixa" | "transferencia";

/* Formato da movimentação no GET /api/estoque-usados/extrato (só o que é usado). */
export interface MovimentoErp {
  idMovimentacao: string;
  codEmp?: number | null;
  data: string;
  dataSistema?: string | null;
  sentido?: string | null;
  tipo: string;
  modalidade?: string | null;
  documento?: {
    numero?: number | string | null;
    serie?: string | null;
    chaveAcesso?: string | null;
    situacao?: string | null;
    dataEmissao?: string | null;
  } | null;
  cfop?: number | null;
  naturezaOperacao?: string | null;
  tipoNf?: { codigo?: number | null; descricao?: string | null } | null;
  contraparte?: { nome?: string | null; cnpjCpf?: string | null } | null;
  almoxarifadoOrigem?: { descricao?: string | null } | null;
  almoxarifadoDestino?: { descricao?: string | null } | null;
  quantidade?: number | null;
  valores?: {
    unitarioNf?: number | null;
    totalItemNf?: number | null;
    totalNf?: number | null;
    custoCompra?: number | null;
    valorEstoque?: number | null;
  } | null;
  saldoDepois?: { local?: string | null } | null;
  vendaDeConsignacao?: boolean | null;
}

export interface EquipamentoErp {
  codItem: string;
  mascaras: { id: number | string; codEmp: number }[];
  custoCompra?: number | null;
  situacaoAtual?: {
    codEmp?: number | null;
    local?: string | null;
    desde?: string | null;
    ultimoTipo?: string | null;
    contraparte?: { nome?: string | null } | string | null;
  } | null;
  movimentacoes: MovimentoErp[];
}

interface Regra {
  acao: AcaoPortal | null;
  /* Status depois do movimento; null = não muda o status. */
  status: StatusPortal | null;
}

const REGRAS: Record<string, Regra> = {
  COMPRA: { acao: "entrada", status: "em_estoque" },
  IMPLANTACAO: { acao: null, status: "em_estoque" },

  EMPRESTIMO_REMESSA: { acao: "emprestimo", status: "emprestado" },
  CONSIGNACAO_REMESSA: { acao: "consignacao", status: "consignado" },
  INDUSTRIALIZACAO_REMESSA: { acao: "reforma", status: "em_reforma" },
  CONSERTO_REMESSA: { acao: "reforma", status: "em_reforma" },
  GARANTIA_REMESSA: { acao: "reforma", status: "em_reforma" },

  EMPRESTIMO_RETORNO: { acao: "retorno", status: "em_estoque" },
  CONSIGNACAO_RETORNO: { acao: "retorno", status: "em_estoque" },
  INDUSTRIALIZACAO_RETORNO: { acao: "retorno", status: "em_estoque" },
  CONSERTO_RETORNO: { acao: "retorno", status: "em_estoque" },
  GARANTIA_RETORNO: { acao: "retorno", status: "em_estoque" },
  OUTRA_RETORNO: { acao: "retorno", status: "em_estoque" },
  DEVOLUCAO_VENDA: { acao: "retorno", status: "em_estoque" },

  VENDA: { acao: "baixa", status: "baixado" },
  CONSIGNACAO_VENDA: { acao: "baixa", status: "baixado" },
  VENDA_REMESSA_ENTREGA: { acao: "baixa", status: "baixado" },

  /* Sai de uma empresa do grupo e entra na outra: o equipamento continua nosso. */
  TRANSFERENCIA_EMPRESA_SAIDA: { acao: "transferencia", status: null },
  TRANSFERENCIA_EMPRESA_ENTRADA: { acao: null, status: "em_estoque" },
};

/* Tipos que só ficam guardados na cópia do extrato, sem efeito no Portal. */
export const TIPOS_IGNORADOS = new Set(["AJUSTE_VALOR"]);

export function regraDoTipo(tipo: string): Regra {
  return REGRAS[tipo] ?? { acao: null, status: null };
}

export const LABEL_TIPO_ERP: Record<string, string> = {
  COMPRA: "Compra",
  VENDA: "Venda",
  DEVOLUCAO_VENDA: "Devolução de venda",
  VENDA_REMESSA_ENTREGA: "Remessa de entrega de venda",
  CONSIGNACAO_REMESSA: "Remessa em consignação",
  CONSIGNACAO_RETORNO: "Retorno de consignação",
  CONSIGNACAO_VENDA: "Venda em consignação",
  EMPRESTIMO_REMESSA: "Remessa de empréstimo",
  EMPRESTIMO_RETORNO: "Retorno de empréstimo",
  INDUSTRIALIZACAO_REMESSA: "Remessa para reforma",
  INDUSTRIALIZACAO_RETORNO: "Retorno de reforma",
  CONSERTO_REMESSA: "Remessa para conserto",
  CONSERTO_RETORNO: "Retorno de conserto",
  GARANTIA_REMESSA: "Remessa em garantia",
  GARANTIA_RETORNO: "Retorno de garantia",
  TRANSFERENCIA_EMPRESA_SAIDA: "Transferência entre empresas (saída)",
  TRANSFERENCIA_EMPRESA_ENTRADA: "Transferência entre empresas (entrada)",
  TRANSFERENCIA_ALMOXARIFADO: "Transferência entre almoxarifados",
  ACERTO_INVENTARIO: "Acerto de inventário",
  AJUSTE_VALOR: "Ajuste de valor",
  IMPLANTACAO: "Implantação",
  REQUISICAO: "Requisição",
  DEVOLUCAO_REQUISICAO: "Devolução de requisição",
  RECLASSIFICACAO: "Reclassificação",
  OUTRA_ENTRADA: "Outra entrada",
  OUTRA_SAIDA: "Outra saída",
  OUTRA_RETORNO: "Outro retorno",
};

/* Ordem cronológica estável: data, depois a hora de sistema, depois a ordem em que o ERP mandou. */
export function ordenarMovimentos(movimentos: MovimentoErp[]): MovimentoErp[] {
  return movimentos
    .map((m, i) => ({ m, i }))
    .sort(
      (a, b) =>
        a.m.data.localeCompare(b.m.data) ||
        (a.m.dataSistema ?? "").localeCompare(b.m.dataSistema ?? "") ||
        a.i - b.i
    )
    .map(({ m }) => m);
}

/* Status que o ERP indica: o do último movimento que muda status. */
export function statusSegundoErp(movimentos: MovimentoErp[]): { status: StatusPortal | null; movimento: MovimentoErp | null } {
  let resultado: { status: StatusPortal | null; movimento: MovimentoErp | null } = { status: null, movimento: null };
  for (const movimento of ordenarMovimentos(movimentos)) {
    if (TIPOS_IGNORADOS.has(movimento.tipo)) continue;
    const { status } = regraDoTipo(movimento.tipo);
    if (status) resultado = { status, movimento };
  }
  return resultado;
}

/* "000069501", "69501/55", "69.501" -> "69501" (para casar com a NF digitada no Portal). */
export function normalizarNumeroNf(valor: string | number | null | undefined): string | null {
  if (valor === null || valor === undefined) return null;
  const principal = String(valor).split("/")[0];
  const digitos = principal.replace(/\D/g, "").replace(/^0+/, "");
  return digitos || null;
}

/* Quanto tempo uma movimentação manual (registrada antes da NF) espera o ERP confirmar. */
export const DIAS_ESPERA_CONFIRMACAO_ERP = 15;

export interface MovimentacaoManualPendente {
  tipoAcao: AcaoPortal;
  dataAcao: string;
}

/*
 * Decide se o status do Portal muda para o do ERP. Vale o ERP, com uma
 * exceção: quem registrou à mão uma saída/retorno DEPOIS do último
 * movimento do ERP e ainda dentro do prazo está esperando a NF sair --
 * aí o Portal não desfaz o que a pessoa fez. Passado o prazo sem a NF
 * aparecer, o ERP vence.
 */
export function decidirStatus(params: {
  statusPortal: StatusPortal;
  statusErp: StatusPortal | null;
  dataMovimentoErp: string | null;
  manualPendente: MovimentacaoManualPendente | null;
  hoje: string;
}): { mudar: boolean; novoStatus: StatusPortal; motivo: string } {
  const { statusPortal, statusErp, dataMovimentoErp, manualPendente, hoje } = params;

  if (!statusErp) return { mudar: false, novoStatus: statusPortal, motivo: "O ERP não indica status." };
  if (statusErp === statusPortal) return { mudar: false, novoStatus: statusPortal, motivo: "Já está igual ao ERP." };

  if (manualPendente && (!dataMovimentoErp || manualPendente.dataAcao >= dataMovimentoErp)) {
    const dias = (Date.parse(`${hoje}T00:00:00Z`) - Date.parse(`${manualPendente.dataAcao}T00:00:00Z`)) / 86_400_000;
    if (dias <= DIAS_ESPERA_CONFIRMACAO_ERP) {
      return {
        mudar: false,
        novoStatus: statusPortal,
        motivo: `Movimentação manual de ${manualPendente.dataAcao} aguardando a NF no ERP.`,
      };
    }
  }

  return { mudar: true, novoStatus: statusErp, motivo: `Status do ERP: ${statusErp}.` };
}
