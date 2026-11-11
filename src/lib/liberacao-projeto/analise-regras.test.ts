import { describe, expect, it } from "vitest";

import { ehClienteCiber, encontrarDivergencias, type LinhaEstruturaErp } from "./analise-regras";

function linha(campos: Partial<LinhaEstruturaErp>): LinhaEstruturaErp {
  return {
    NIVEL: 2,
    COD_ITEM_PAI: "307024",
    COD_DESENHO_PAI: "307024",
    TP_ITEM_PAI: "FABRICADO",
    DESC_TECNICA_PAI: "CONJUNTO",
    COD_ITEM_FILHO: "311",
    COD_DESENHO_FILHO: "311",
    TP_ITEM_FILHO: "FABRICADO",
    DESC_TECNICA_FILHO: "PECA",
    STATUS_VALIDADE: "VALIDO",
    ...campos,
  };
}

describe("liberação de projeto: item x desenho", () => {
  it("cliente Ciber, com ou sem acento e caixa", () => {
    expect(ehClienteCiber("CIBER EQUIPAMENTOS RODOVIÁRIOS LTDA")).toBe(true);
    expect(ehClienteCiber("Ciber Equipamentos")).toBe(true);
    expect(ehClienteCiber("CIBERNETICA LTDA")).toBe(false);
    expect(ehClienteCiber("TRIEL-HT")).toBe(false);
    expect(ehClienteCiber("")).toBe(false);
  });

  it("só fabricado vigente com desenho diferente (ou em branco) entra", () => {
    const divergencias = encontrarDivergencias([
      linha({}),
      linha({ COD_ITEM_FILHO: "81135", COD_DESENHO_FILHO: "256430", DESC_TECNICA_FILHO: "PARALAMA", COD_ITEM_PAI: "268080" }),
      linha({ COD_ITEM_FILHO: "500", COD_DESENHO_FILHO: "999", TP_ITEM_FILHO: "COMPRADO" }),
      linha({ COD_ITEM_FILHO: "600", COD_DESENHO_FILHO: "601", STATUS_VALIDADE: "INVALIDO" }),
      linha({ COD_ITEM_FILHO: "700", COD_DESENHO_FILHO: null }),
      linha({ COD_ITEM_FILHO: "ab12", COD_DESENHO_FILHO: "AB12 " }),
    ]);

    expect(divergencias).toEqual([
      { codigoItem: "700", codigoDesenho: "", descricao: "PECA", pais: ["307024"] },
      { codigoItem: "81135", codigoDesenho: "256430", descricao: "PARALAMA", pais: ["268080"] },
    ]);
  });

  it("item repetido aparece uma vez, com todos os pais; a raiz entra pelo nível 1", () => {
    const divergencias = encontrarDivergencias([
      linha({ NIVEL: 1, COD_ITEM_PAI: "307389", COD_DESENHO_PAI: "307388", DESC_TECNICA_PAI: "PROJETO", COD_ITEM_FILHO: "307024", COD_DESENHO_FILHO: "307024" }),
      linha({ NIVEL: 1, COD_ITEM_PAI: "307389", COD_DESENHO_PAI: "307388", COD_ITEM_FILHO: "100", COD_DESENHO_FILHO: "100" }),
      linha({ COD_ITEM_PAI: "A", COD_ITEM_FILHO: "69749", COD_DESENHO_FILHO: "194346" }),
      linha({ COD_ITEM_PAI: "B", COD_ITEM_FILHO: "69749", COD_DESENHO_FILHO: "194346" }),
      linha({ COD_ITEM_PAI: "A", COD_ITEM_FILHO: "69749", COD_DESENHO_FILHO: "194346" }),
    ]);

    /* Ordem numérica do código. */
    expect(divergencias).toEqual([
      { codigoItem: "69749", codigoDesenho: "194346", descricao: "PECA", pais: ["A", "B"] },
      { codigoItem: "307389", codigoDesenho: "307388", descricao: "PROJETO", pais: [] },
    ]);
  });

  it("estrutura sem divergência devolve lista vazia", () => {
    expect(encontrarDivergencias([linha({}), linha({ COD_ITEM_FILHO: "2", COD_DESENHO_FILHO: "2" })])).toEqual([]);
  });
});
