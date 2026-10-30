/*
 * Cálculo da página "quanto vale e há quanto tempo" do painel gerencial
 * -- puro (testado em painel-gerencial-regras.test.ts). Cada bloco
 * espelha um quadro da página 1, na mesma posição:
 *   status (qtde)        -> capital por status (R$)
 *   por tipo (qtde)      -> tempo fora por faixa (aging, R$)
 *   valor por tipo       -> valor com terceiros por tipo
 *   entradas por mês     -> fluxo por mês (saídas, retornos, vendas)
 *   movimentações        -> resultado das consignações
 *   fora por cliente     -> capital por cliente + prazo médio
 */

export type StatusGerencial = "em_estoque" | "emprestado" | "consignado" | "em_reforma" | "baixado";

export interface EquipamentoGerencial {
  id: string;
  numero: number;
  status: StatusGerencial;
  valor: number;
  tipoNome: string;
}

export interface MovimentacaoGerencial {
  equipamentoId: string;
  tipoAcao: string;
  dataAcao: string;
  motivoBaixa: string | null;
  destinatarioNome: string | null;
}

export const FAIXAS_AGING = ["Até 90 dias", "91 a 180 dias", "181 a 365 dias", "Mais de 1 ano"] as const;

export interface PainelGerencial {
  valorAtivo: number;
  valorPorStatus: { status: StatusGerencial; quantidade: number; valorTotal: number }[];
  quantidadeFora: number;
  valorFora: number;
  percentualForaValor: number | null;
  prazoMedioForaDias: number | null;
  acima180: { quantidade: number; valor: number };
  maiorPrazo: { numero: number; dias: number; cliente: string | null } | null;
  aging: { faixa: string; emprestado: number; consignado: number; em_reforma: number; quantidade: number }[];
  valorForaPorTipo: { tipoNome: string; valorTotal: number; quantidade: number }[];
  fluxoPorMes: { mes: string; saidas: number; retornos: number; vendas: number }[];
  consignacoes: {
    viraramVenda: number;
    voltaram: number;
    emAberto: number;
    diasMedioAteVenda: number | null;
    diasMedioAteRetorno: number | null;
  };
  clientesFora: { nomeCliente: string; valorTotal: number; quantidade: number; prazoMedioDias: number }[];
  atualizadoEm: string;
}

const STATUS_FORA: StatusGerencial[] = ["emprestado", "consignado", "em_reforma"];
const SAIDA_DO_STATUS: Record<string, string> = { emprestado: "emprestimo", consignado: "consignacao", em_reforma: "reforma" };
const ACOES_SAIDA = new Set(["emprestimo", "consignacao", "reforma"]);
/* Venda logo depois da devolução de consignação (o ERP faz retorno + venda) conta como consignação vendida. */
const DIAS_VENDA_APOS_RETORNO = 7;

function dias(de: string, ate: string): number {
  return Math.max(0, Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000));
}

function media(valores: number[]): number | null {
  return valores.length ? Math.round(valores.reduce((a, b) => a + b, 0) / valores.length) : null;
}

function faixaAging(diasFora: number): string {
  if (diasFora <= 90) return FAIXAS_AGING[0];
  if (diasFora <= 180) return FAIXAS_AGING[1];
  if (diasFora <= 365) return FAIXAS_AGING[2];
  return FAIXAS_AGING[3];
}

/* Os 12 meses até o atual, "AAAA-MM", do mais antigo para o mais novo. */
export function ultimosMeses(hoje: string, quantidade = 12): string[] {
  const ano = Number(hoje.slice(0, 4));
  const mes = Number(hoje.slice(5, 7));
  return Array.from({ length: quantidade }, (_, i) => {
    const total = ano * 12 + (mes - 1) - (quantidade - 1 - i);
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
  });
}

export function calcularPainelGerencial(
  equipamentos: EquipamentoGerencial[],
  movimentacoes: MovimentacaoGerencial[],
  hoje: string
): PainelGerencial {
  const movsPorEquipamento = new Map<string, MovimentacaoGerencial[]>();
  for (const m of movimentacoes) movsPorEquipamento.set(m.equipamentoId, [...(movsPorEquipamento.get(m.equipamentoId) ?? []), m]);

  /* Capital por status (mesmo valor do cadastro que a página 1 usa) */
  const valorPorStatus = (["em_estoque", "emprestado", "consignado", "em_reforma", "baixado"] as StatusGerencial[]).map((status) => {
    const doStatus = equipamentos.filter((e) => e.status === status);
    return { status, quantidade: doStatus.length, valorTotal: doStatus.reduce((s, e) => s + e.valor, 0) };
  });
  const ativos = equipamentos.filter((e) => e.status !== "baixado");
  const valorAtivo = ativos.reduce((s, e) => s + e.valor, 0);

  /* Fora: desde a última saída do tipo do status atual */
  const fora = equipamentos
    .filter((e) => STATUS_FORA.includes(e.status))
    .map((e) => {
      const saidas = (movsPorEquipamento.get(e.id) ?? []).filter((m) => m.tipoAcao === SAIDA_DO_STATUS[e.status]);
      const ultima = saidas.at(-1) ?? null;
      return {
        ...e,
        desde: ultima?.dataAcao ?? null,
        diasFora: ultima ? dias(ultima.dataAcao, hoje) : 0,
        cliente: ultima?.destinatarioNome?.trim() || null,
      };
    });
  const valorFora = fora.reduce((s, e) => s + e.valor, 0);
  const comData = fora.filter((e) => e.desde);
  const acima180 = comData.filter((e) => e.diasFora > 180);
  const maior = [...comData].sort((a, b) => b.diasFora - a.diasFora)[0];

  const aging = FAIXAS_AGING.map((faixa) => {
    const naFaixa = comData.filter((e) => faixaAging(e.diasFora) === faixa);
    const soma = (status: StatusGerencial) => naFaixa.filter((e) => e.status === status).reduce((s, e) => s + e.valor, 0);
    return { faixa, emprestado: soma("emprestado"), consignado: soma("consignado"), em_reforma: soma("em_reforma"), quantidade: naFaixa.length };
  });

  const porTipo = new Map<string, { valorTotal: number; quantidade: number }>();
  for (const e of fora) {
    const atual = porTipo.get(e.tipoNome) ?? { valorTotal: 0, quantidade: 0 };
    porTipo.set(e.tipoNome, { valorTotal: atual.valorTotal + e.valor, quantidade: atual.quantidade + 1 });
  }

  const porCliente = new Map<string, { valorTotal: number; quantidade: number; dias: number[] }>();
  for (const e of fora) {
    const nome = e.cliente ?? "Sem destinatário";
    const atual = porCliente.get(nome) ?? { valorTotal: 0, quantidade: 0, dias: [] };
    porCliente.set(nome, {
      valorTotal: atual.valorTotal + e.valor,
      quantidade: atual.quantidade + 1,
      dias: e.desde ? [...atual.dias, e.diasFora] : atual.dias,
    });
  }

  /* Fluxo por mês */
  const meses = ultimosMeses(hoje);
  const fluxoPorMes = meses.map((mes) => {
    const doMes = movimentacoes.filter((m) => m.dataAcao.startsWith(mes));
    return {
      mes,
      saidas: doMes.filter((m) => ACOES_SAIDA.has(m.tipoAcao)).length,
      retornos: doMes.filter((m) => m.tipoAcao === "retorno").length,
      vendas: doMes.filter((m) => m.tipoAcao === "baixa" && m.motivoBaixa === "venda").length,
    };
  });

  /* Resultado das consignações: o que veio depois de cada uma */
  let viraramVenda = 0;
  let voltaram = 0;
  let emAberto = 0;
  const diasAteVenda: number[] = [];
  const diasAteRetorno: number[] = [];
  for (const lista of movsPorEquipamento.values()) {
    lista.forEach((m, i) => {
      if (m.tipoAcao !== "consignacao") return;
      const seguinte = lista.slice(i + 1).find((x) => x.tipoAcao === "retorno" || x.tipoAcao === "baixa" || ACOES_SAIDA.has(x.tipoAcao));
      if (!seguinte || ACOES_SAIDA.has(seguinte.tipoAcao)) {
        if (!seguinte) emAberto += 1;
        return;
      }
      if (seguinte.tipoAcao === "baixa") {
        if (seguinte.motivoBaixa === "venda") {
          viraramVenda += 1;
          diasAteVenda.push(dias(m.dataAcao, seguinte.dataAcao));
        }
        return;
      }
      const posRetorno = lista.slice(lista.indexOf(seguinte) + 1).find((x) => x.tipoAcao === "baixa" || ACOES_SAIDA.has(x.tipoAcao));
      if (posRetorno?.tipoAcao === "baixa" && posRetorno.motivoBaixa === "venda" && dias(seguinte.dataAcao, posRetorno.dataAcao) <= DIAS_VENDA_APOS_RETORNO) {
        viraramVenda += 1;
        diasAteVenda.push(dias(m.dataAcao, posRetorno.dataAcao));
      } else {
        voltaram += 1;
        diasAteRetorno.push(dias(m.dataAcao, seguinte.dataAcao));
      }
    });
  }

  return {
    valorAtivo,
    valorPorStatus,
    quantidadeFora: fora.length,
    valorFora,
    percentualForaValor: valorAtivo > 0 ? Math.round((valorFora / valorAtivo) * 100) : null,
    prazoMedioForaDias: media(comData.map((e) => e.diasFora)),
    acima180: { quantidade: acima180.length, valor: acima180.reduce((s, e) => s + e.valor, 0) },
    maiorPrazo: maior ? { numero: maior.numero, dias: maior.diasFora, cliente: maior.cliente } : null,
    aging,
    valorForaPorTipo: [...porTipo.entries()]
      .map(([tipoNome, v]) => ({ tipoNome, ...v }))
      .sort((a, b) => b.valorTotal - a.valorTotal),
    fluxoPorMes,
    consignacoes: {
      viraramVenda,
      voltaram,
      emAberto,
      diasMedioAteVenda: media(diasAteVenda),
      diasMedioAteRetorno: media(diasAteRetorno),
    },
    clientesFora: [...porCliente.entries()]
      .map(([nomeCliente, v]) => ({ nomeCliente, valorTotal: v.valorTotal, quantidade: v.quantidade, prazoMedioDias: media(v.dias) ?? 0 }))
      .sort((a, b) => b.valorTotal - a.valorTotal)
      .slice(0, 8),
    atualizadoEm: new Date().toISOString(),
  };
}
