import { describe, expect, it } from "vitest";

import { calcularPainelGerencial, ultimosMeses, type EquipamentoGerencial, type MovimentacaoGerencial } from "./painel-gerencial-regras";

const HOJE = "2026-10-30";

function equip(id: string, numero: number, status: EquipamentoGerencial["status"], valor: number, tipoNome = "Silo"): EquipamentoGerencial {
  return { id, numero, status, valor, tipoNome };
}

function mov(equipamentoId: string, tipoAcao: string, dataAcao: string, extra: Partial<MovimentacaoGerencial> = {}): MovimentacaoGerencial {
  return { equipamentoId, tipoAcao, dataAcao, motivoBaixa: null, destinatarioNome: null, ...extra };
}

describe("calcularPainelGerencial", () => {
  const equipamentos = [
    equip("a", 889, "consignado", 40000),
    equip("b", 902, "consignado", 50000),
    equip("c", 993, "em_estoque", 30000, "Suínos"),
    equip("d", 814, "baixado", 12000),
    equip("e", 784, "em_reforma", 20000),
  ];
  const movimentacoes = [
    mov("a", "entrada", "2024-11-22"),
    mov("a", "consignacao", "2025-02-28", { destinatarioNome: "EREPREST" }),
    mov("b", "consignacao", "2025-10-13", { destinatarioNome: "EREPREST" }),
    mov("e", "reforma", "2026-09-01", { destinatarioNome: "REFORMAQ" }),
    /* 814: emprestou, voltou, consignou, voltou e foi vendido no mesmo dia (= consignação vendida) */
    mov("d", "emprestimo", "2023-05-04"),
    mov("d", "retorno", "2023-10-02"),
    mov("d", "consignacao", "2025-02-28"),
    mov("d", "retorno", "2026-05-18"),
    mov("d", "baixa", "2026-05-18", { motivoBaixa: "venda" }),
  ];
  const r = calcularPainelGerencial(equipamentos, movimentacoes, HOJE);

  it("capital por status e % fora usam o valor do cadastro (igual à página 1)", () => {
    expect(r.valorPorStatus.find((s) => s.status === "consignado")).toEqual({ status: "consignado", quantidade: 2, valorTotal: 90000 });
    expect(r.valorAtivo).toBe(140000);
    expect(r.valorFora).toBe(110000);
    expect(r.quantidadeFora).toBe(3);
    expect(r.percentualForaValor).toBe(79);
  });

  it("tempo fora conta desde a última saída do tipo do status atual", () => {
    expect(r.maiorPrazo).toEqual({ numero: 889, dias: 609, cliente: "EREPREST" });
    expect(r.acima180).toEqual({ quantidade: 2, valor: 90000 });
    expect(r.prazoMedioForaDias).toBe(Math.round((609 + 382 + 59) / 3));
  });

  it("aging separa as faixas por modalidade", () => {
    expect(r.aging.find((f) => f.faixa === "Até 90 dias")).toMatchObject({ em_reforma: 20000, quantidade: 1 });
    expect(r.aging.find((f) => f.faixa === "Mais de 1 ano")).toMatchObject({ consignado: 90000, quantidade: 2 });
  });

  it("capital por cliente com prazo médio", () => {
    expect(r.clientesFora[0]).toEqual({ nomeCliente: "EREPREST", valorTotal: 90000, quantidade: 2, prazoMedioDias: 496 });
  });

  it("consignação que volta e vira venda logo depois conta como vendida", () => {
    expect(r.consignacoes).toMatchObject({ viraramVenda: 1, voltaram: 0, emAberto: 2, diasMedioAteVenda: 444 });
  });

  it("fluxo por mês cobre os últimos 12 meses", () => {
    expect(r.fluxoPorMes).toHaveLength(12);
    expect(r.fluxoPorMes.at(-1)?.mes).toBe("2026-10");
    expect(r.fluxoPorMes.find((m) => m.mes === "2026-05")).toEqual({ mes: "2026-05", saidas: 0, retornos: 1, vendas: 1 });
    expect(r.fluxoPorMes.find((m) => m.mes === "2026-09")).toEqual({ mes: "2026-09", saidas: 1, retornos: 0, vendas: 0 });
  });
});

describe("ultimosMeses", () => {
  it("vira o ano", () => {
    expect(ultimosMeses("2026-02-10", 4)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
});
