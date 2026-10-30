import { describe, expect, it } from "vitest";

import { classificarFator, itensDaPlanilha, manterProporcaoBruta, origemDoPeso, type ItemErpFator } from "./fator-regras";
import { lerAba } from "./separacao-regras";

const erp = (parcial: Partial<ItemErpFator>): ItemErpFator => ({
  codigo: "X",
  unidEstoque: "UN",
  pesoLiq: null,
  conversaoKg: null,
  ...parcial,
});
const item = (pesoPlanilha: number | null) => ({ codigo: "X", aba: "CHAPARIA", pesoPlanilha });

describe("itensDaPlanilha", () => {
  it("só as abas do fator (ex.: CHAPARIA), sem diferenciar maiúsculas", () => {
    const abas = [
      lerAba("CHAPARIA", [["Nº DO ITEM", "Nº DA PEÇA", "Peso"], ["1", 100, 0.11]]),
      lerAba("USINAGEM", [["Nº DO ITEM", "Nº DA PEÇA", "Peso"], ["1", 200, 0.5]]),
      lerAba("COMPRADOS", [["Nº DO ITEM", "Nº DA PEÇA", "Peso"], ["1", 300, 0.3]]),
    ];
    expect(itensDaPlanilha(abas, ["original", "MESTRA"], ["chaparia"]).map((i) => i.codigo)).toEqual(["100"]);
  });

  it("um por código, sem as abas da blacklist", () => {
    const abas = [
      lerAba("MESTRA", [["Nº DO ITEM", "Nº DA PEÇA", "Peso"], ["1", 100, 9]]),
      lerAba("CHAPARIA", [["Nº DO ITEM", "Nº DA PEÇA", "Peso"], ["1", 100, 0.11], ["2", 101, 0.5]]),
      lerAba("USINAGEM", [["Nº DO ITEM", "Nº DA PEÇA", "Peso"], ["1", 100, 0.11]]),
    ];
    expect(itensDaPlanilha(abas, ["mestra"])).toEqual([
      { codigo: "100", aba: "CHAPARIA", pesoPlanilha: 0.11 },
      { codigo: "101", aba: "CHAPARIA", pesoPlanilha: 0.5 },
    ]);
  });
});

describe("classificarFator", () => {
  it("peso bate e não há conversão: incluir 1/peso do ERP, marcado", () => {
    const l = classificarFator(item(0.11), erp({ pesoLiq: 0.11 }));
    expect([l.situacao, l.operacao, l.origemPeso, l.marcavel, l.marcadoPorPadrao]).toEqual(["incluir", "incluir", "erp", true, true]);
    expect(l.taxaProposta).toBeCloseTo(9.0909090909, 9);
  });

  it("arredondamento de 3 x 4 casas conta como o mesmo peso (usa o do ERP)", () => {
    const l = classificarFator(item(1.104), erp({ unidEstoque: "PC", pesoLiq: 1.1035 }));
    expect(l.situacao).toBe("incluir");
    expect(l.taxaProposta).toBeCloseTo(1 / 1.1035, 10);
  });

  it("conversão certa (até 0,1%): nada a fazer", () => {
    const l = classificarFator(item(0.11), erp({ pesoLiq: 0.11, conversaoKg: { id: 1, taxa: 9.0909090909 } }));
    expect([l.situacao, l.operacao, l.marcavel]).toEqual(["ok", null, false]);
  });

  it("conversão de peso arredondado (1/0,81 com peso 0,809): alterar, marcado", () => {
    const l = classificarFator(item(0.809), erp({ pesoLiq: 0.809, conversaoKg: { id: 7, taxa: 1.2345679012 } }));
    expect([l.situacao, l.operacao, l.conversaoId, l.marcadoPorPadrao]).toEqual(["alterar", "alterar", 7, true]);
  });

  it("peso divergente: destacado, desmarcado, e se marcar usa o peso da planilha", () => {
    const l = classificarFator(item(18.29), erp({ pesoLiq: 31.228 }));
    expect([l.situacao, l.operacao, l.origemPeso, l.marcavel, l.marcadoPorPadrao]).toEqual([
      "peso_divergente",
      "incluir",
      "planilha",
      true,
      false,
    ]);
    expect(l.taxaProposta).toBeCloseTo(1 / 18.29, 10);
  });

  it("ERP sem peso com fator diferente: alterar pelo peso da planilha, já marcado (ERP sem peso não é problema)", () => {
    const l = classificarFator(item(0.607), erp({ pesoLiq: null, conversaoKg: { id: 9, taxa: 1.6393442623 } }));
    expect([l.situacao, l.operacao, l.origemPeso, l.marcadoPorPadrao]).toEqual(["alterar", "alterar", "planilha", true]);
  });

  it("ERP sem peso (vazio ou 0) com o fator já batendo com a planilha: fator certo", () => {
    for (const pesoLiq of [null, 0]) {
      const l = classificarFator(item(1.484), erp({ pesoLiq, conversaoKg: { id: 3, taxa: 0.6738544474 } }));
      expect([l.situacao, l.operacao, l.marcavel]).toEqual(["ok", null, false]);
    }
  });

  it("divergente cuja conversão já bate com a planilha: continua divergente (peso do ERP diferente), nada a marcar", () => {
    const l = classificarFator(item(0.5), erp({ pesoLiq: 0.7, conversaoKg: { id: 2, taxa: 2 } }));
    expect([l.situacao, l.operacao, l.marcavel]).toEqual(["peso_divergente", null, false]);
  });

  it("item sem unidade de estoque no ERP: só aviso (o ERP derrubaria o lote)", () => {
    const l = classificarFator(item(1), erp({ unidEstoque: null, pesoLiq: 1 }));
    expect([l.situacao, l.marcavel]).toEqual(["sem_unidade", false]);
  });

  it("mesmo código com pesos diferentes em duas abas: conflito, só aviso", () => {
    const abas = [
      lerAba("CHAPARIA", [["Nº DO ITEM", "Nº DA PEÇA", "Peso"], ["1", 100, 0.5]]),
      lerAba("USINAGEM", [["Nº DO ITEM", "Nº DA PEÇA", "Peso"], ["1", 100, 0.9]]),
    ];
    const [unico] = itensDaPlanilha(abas, []);
    expect(unico.conflito).toBe(true);
    const l = classificarFator(unico, { codigo: "100", unidEstoque: "UN", pesoLiq: 0.5, conversaoKg: null });
    expect([l.situacao, l.marcavel]).toEqual(["planilha_conflito", false]);
  });

  it("ERP sem peso e sem fator: incluir pelo peso da planilha, já marcado", () => {
    const l = classificarFator(item(0.332), erp({ unidEstoque: "PC", pesoLiq: 0 }));
    expect([l.situacao, l.operacao, l.origemPeso, l.marcadoPorPadrao]).toEqual(["incluir", "incluir", "planilha", true]);
    expect(l.taxaProposta).toBeCloseTo(1 / 0.332, 10);
  });

  it("estoque em KG, item fora do ERP e planilha sem peso: só aviso", () => {
    expect(classificarFator(item(1), erp({ unidEstoque: "KG", pesoLiq: 1 })).situacao).toBe("estoque_kg");
    expect(classificarFator(item(1), undefined).situacao).toBe("nao_encontrado");
    expect(classificarFator(item(null), erp({ pesoLiq: 1 })).situacao).toBe("planilha_sem_peso");
    expect(classificarFator(item(0), erp({ pesoLiq: 1 })).marcavel).toBe(false);
  });
});

describe("ajuste de peso", () => {
  it("bruto acompanha o líquido só quando hoje segue 1,1 x líquido", () => {
    expect(manterProporcaoBruta(0.124, 0.1364)).toBe(true);
    expect(manterProporcaoBruta(31.228, 34.3508)).toBe(true);
    expect(manterProporcaoBruta(0.124, 0.2)).toBe(false);
    expect(manterProporcaoBruta(0.124, null)).toBe(false);
    expect(manterProporcaoBruta(null, 0.13)).toBe(false);
  });

  it("origem do peso escolhido", () => {
    expect(origemDoPeso(0.121, 0.121, 0.124)).toBe("planilha");
    expect(origemDoPeso(0.124, 0.121, 0.124)).toBe("erp");
    expect(origemDoPeso(0.122, 0.121, 0.124)).toBe("digitado");
  });
});

describe("divergência já decidida em Ajustar peso", () => {
  const erpComPesoDoErp = { codigo: "X", unidEstoque: "UN", pesoLiq: 0.124, conversaoKg: { id: 1, taxa: 1 / 0.124 } };

  it("escolheu o peso do ERP e o ERP está com ele e com o fator certo: some da lista (ok)", () => {
    const l = classificarFator({ codigo: "X", aba: "CHAPARIA", pesoPlanilha: 0.121 }, erpComPesoDoErp, 0.124);
    expect([l.situacao, l.marcavel]).toEqual(["ok", false]);
  });

  it("sem decisão registrada, continua divergente", () => {
    expect(classificarFator({ codigo: "X", aba: "CHAPARIA", pesoPlanilha: 0.121 }, erpComPesoDoErp).situacao).toBe("peso_divergente");
  });

  it("decisão antiga, mas o peso do ERP mudou depois (ex.: importação do 3DX): volta a aparecer", () => {
    const mudou = { ...erpComPesoDoErp, pesoLiq: 0.13 };
    expect(classificarFator({ codigo: "X", aba: "CHAPARIA", pesoPlanilha: 0.121 }, mudou, 0.124).situacao).toBe("peso_divergente");
  });
});
