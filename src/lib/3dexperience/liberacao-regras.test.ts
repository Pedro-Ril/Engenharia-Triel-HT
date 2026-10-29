import { describe, expect, it } from "vitest";

import { achatarEstrutura, emTrabalho, montarFila, type NoEstrutura3DX } from "./liberacao-regras";

/* 300 (pai) -> 310 (conj) -> 311 (peça); 311 também direto debaixo do pai. */
const ARVORE: NoEstrutura3DX = {
  physicalId: "P300",
  codigo: "300",
  status: "IN_WORK",
  children: [
    {
      physicalId: "P310",
      codigo: "310",
      status: "RELEASED",
      children: [{ physicalId: "P311", codigo: "311", status: "IN_WORK", children: [] }],
    },
    { physicalId: "P311", codigo: "311", status: "IN_WORK", children: [] },
    { physicalId: "PX", codigo: "999", circular: true, children: [{ physicalId: "PY", codigo: "nunca" }] },
  ],
};

describe("achatarEstrutura", () => {
  it("um item por physicalId, no nível mais fundo, com o pai no nível 0", () => {
    const itens = achatarEstrutura(ARVORE);
    expect(itens.map((i) => [i.codigo, i.nivel])).toEqual([
      ["300", 0],
      ["310", 1],
      ["311", 2],
      ["999", 1],
    ]);
  });

  it("não desce em nó circular", () => {
    expect(achatarEstrutura(ARVORE).some((i) => i.codigo === "nunca")).toBe(false);
  });
});

describe("montarFila", () => {
  const itens = achatarEstrutura(ARVORE);
  const desenhos = new Map([
    ["P300", [{ physicalId: "D300", titulo: "DES 300", status: "IN_WORK" }]],
    ["P310", [{ physicalId: "D310", titulo: "DES 310", status: "RELEASED" }]],
    [
      "P311",
      [
        { physicalId: "D311a", titulo: "DES 311 A", status: "IN_WORK" },
        { physicalId: "D311b", titulo: "DES 311 B", status: "IN_WORK" },
      ],
    ],
    /* O mesmo desenho ligado ao pai e à peça: fica o da peça (mais funda). */
    ["P999", []],
  ]);
  desenhos.get("P300")!.push({ physicalId: "D311a", titulo: "DES 311 A", status: "IN_WORK" });

  it("de baixo para cima, um por desenho, todos os desenhos de cada item", () => {
    const fila = montarFila(itens, desenhos);
    expect(fila.map((f) => [f.desenho.physicalId, f.item.codigo])).toEqual([
      ["D311a", "311"],
      ["D311b", "311"],
      ["D310", "310"],
      ["D300", "300"],
    ]);
  });

  it("em trabalho = status IN_WORK do desenho, sem diferenciar maiúsculas", () => {
    expect(emTrabalho({ status: "in_work" })).toBe(true);
    expect(emTrabalho({ status: "RELEASED" })).toBe(false);
    expect(emTrabalho({ status: null })).toBe(false);
  });
});
