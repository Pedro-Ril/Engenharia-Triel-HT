import { describe, expect, it } from "vitest";

import type { PedidoCompraPainel } from "../types/aprovacoes.types";
import {
  agruparPorDestino,
  formatarCentroCusto,
  formatarDataCurta,
  formatarDocumento,
  formatarValor,
  motivosAtencao,
  ordenarPedidos,
  resumirCentrosCusto,
  resumirTotais,
  somarPedidos,
} from "./pedidos-compra-formato";

/* toLocaleString usa espaço não separável entre "R$" e o número. */
const limpar = (texto: string) => texto.replace(/ /g, " ");

describe("formatarValor", () => {
  it("formata em reais quando não há moeda", () => {
    expect(limpar(formatarValor(4294.62, null))).toBe("R$ 4.294,62");
  });

  it("escreve a moeda estrangeira sem forçar R$", () => {
    expect(formatarValor(1234.5, "EURO")).toBe("EURO 1.234,50");
  });

  it("mostra traço quando não há valor", () => {
    expect(formatarValor(null, null)).toBe("-");
  });

  it("arredonda centavos", () => {
    expect(limpar(formatarValor(0.1 + 0.2, null))).toBe("R$ 0,30");
  });
});

describe("formatarDataCurta", () => {
  it("converte ISO para dd/mm/aaaa", () => {
    expect(formatarDataCurta("2026-10-21")).toBe("21/10/2026");
  });

  it("aceita data com hora", () => {
    expect(formatarDataCurta("2026-10-21T09:41:55.000")).toBe("21/10/2026");
  });

  it("mostra traço quando vazio ou fora do formato", () => {
    expect(formatarDataCurta(null)).toBe("-");
    expect(formatarDataCurta("")).toBe("-");
    expect(formatarDataCurta("ontem")).toBe("-");
  });
});

describe("formatarDocumento", () => {
  it("formata CNPJ de 14 dígitos", () => {
    expect(formatarDocumento("01994951001834")).toBe("01.994.951/0018-34");
  });

  it("formata CPF de 11 dígitos", () => {
    expect(formatarDocumento("12345678901")).toBe("123.456.789-01");
  });

  it("não reformata documento já com máscara de forma errada", () => {
    expect(formatarDocumento("01.994.951/0018-34")).toBe("01.994.951/0018-34");
  });

  it("devolve como veio quando o tamanho não é de CNPJ nem CPF", () => {
    expect(formatarDocumento("123")).toBe("123");
  });
});

describe("somarPedidos / resumirTotais", () => {
  it("soma por moeda e conta os sem valor", () => {
    const totais = somarPedidos([
      { valorTotal: 2070.03, moeda: null },
      { valorTotal: 2224.59, moeda: null },
      { valorTotal: 100, moeda: "EURO" },
      { valorTotal: null, moeda: null },
    ]);

    expect(totais.quantidade).toBe(4);
    expect(totais.semValor).toBe(1);
    expect(totais.porMoeda.get("")).toBeCloseTo(4294.62, 2);
    expect(totais.porMoeda.get("EURO")).toBe(100);
  });

  it("resume com real primeiro e depois as outras moedas", () => {
    const totais = somarPedidos([
      { valorTotal: 50, moeda: "USD" },
      { valorTotal: 10, moeda: null },
      { valorTotal: 20, moeda: "EURO" },
    ]);

    expect(limpar(resumirTotais(totais.porMoeda))).toBe("R$ 10,00 + EURO 20,00 + USD 50,00");
  });

  it("lista vazia mostra traço", () => {
    expect(resumirTotais(somarPedidos([]).porMoeda)).toBe("-");
  });

  it("lista só com pedidos sem valor mostra traço e conta todos", () => {
    const totais = somarPedidos([{ valorTotal: null, moeda: null }]);
    expect(resumirTotais(totais.porMoeda)).toBe("-");
    expect(totais.semValor).toBe(1);
  });
});

describe("centro de custo", () => {
  it("formata como a regra escreve (90.02.204) e deixa código curto como veio", () => {
    expect(formatarCentroCusto("9002204")).toBe("90.02.204");
    expect(formatarCentroCusto("5500")).toBe("5500");
  });

  it("resume com +N depois do máximo", () => {
    expect(resumirCentrosCusto(["9002204"])).toBe("90.02.204");
    expect(resumirCentrosCusto(["9002204", "9090582", "9003301"])).toBe("90.02.204, 90.90.582 +1");
  });
});

describe("fila com volume", () => {
  const pedido = (id: string, vaiPara: PedidoCompraPainel["vaiPara"], valorTotal = 100, naMinhaVez = true) =>
    ({ id, naMinhaVez, vaiPara, valorTotal, moeda: null }) as PedidoCompraPainel;
  const darlan = { proximoNivel: "Diretoria", pessoa: { id: "D", nome: "Darlan" } };
  const todos = { proximoNivel: "Diretoria", pessoa: null };

  it("agrupa por destino: pessoa, todos do nível e aprovação final por último", () => {
    const grupos = agruparPorDestino([
      pedido("1", darlan),
      pedido("2", null),
      pedido("3", todos),
      pedido("4", darlan, 50),
      pedido("5", darlan, 999, false),
    ]);
    expect(grupos.map((g) => [g.rotulo, g.ids])).toEqual([
      ["Darlan", ["1", "4"]],
      ["Todos da Diretoria", ["3"]],
      ["Aprovação final", ["2"]],
    ]);
    expect(grupos[0].totais.porMoeda.get("")).toBe(150);
  });

  it("pedido fora da vez (ou sem destino calculado) não entra no resumo", () => {
    expect(agruparPorDestino([pedido("1", undefined), pedido("2", darlan, 1, false)])).toEqual([]);
  });

  it("aponta só o que foge do normal num pendente", () => {
    const base = { status: "pendente", situacaoErp: "pendente", temFoto: true } as const;
    expect(motivosAtencao(base)).toEqual([]);
    expect(motivosAtencao({ ...base, situacaoErp: "cancelado" })).toEqual(["Cancelado no Focco"]);
    expect(motivosAtencao({ ...base, temFoto: false })).toHaveLength(1);
    expect(motivosAtencao({ ...base, status: "aprovado", situacaoErp: "atendido" })).toEqual([]);
  });

  it("ordena por valor (sem valor por último), emissão e empresa; 'fila' mantém a ordem", () => {
    const lista = [
      { valorTotal: 10, dataEmissao: "2026-10-20", empresa: 30, numero: 5 },
      { valorTotal: null, dataEmissao: null, empresa: 2, numero: 9 },
      { valorTotal: 99, dataEmissao: "2026-10-01", empresa: 2, numero: 1 },
    ];
    expect(ordenarPedidos(lista, "fila")).toBe(lista);
    expect(ordenarPedidos(lista, "valor").map((p) => p.valorTotal)).toEqual([99, 10, null]);
    expect(ordenarPedidos(lista, "emissao").map((p) => p.dataEmissao)).toEqual(["2026-10-01", "2026-10-20", null]);
    expect(ordenarPedidos(lista, "empresa").map((p) => p.numero)).toEqual([1, 9, 5]);
  });
});
