import { describe, expect, it } from "vitest";

import {
  achatarEstrutura,
  emTrabalho,
  escolherDesenhosAutomaticos,
  montarFila,
  tituloDiferenteDoItem,
  type NoEstrutura3DX,
} from "./liberacao-regras";

describe("liberação agendada: escolherDesenhosAutomaticos", () => {
  const d = (id: string, item: string, titulo: string, acao: string) => ({
    desenhoPhysicalId: id,
    itemCodigo: item,
    desenhoTitulo: titulo,
    acao,
  });
  const simulacao = [
    d("D1", "311", "311", "seria_liberado"),
    d("D2", "310", "310", "ja_liberado"),
    d("D3", "307748", "F0298804_novo", "seria_liberado"),
    d("D4", "300", "300", "seria_liberado"),
  ];

  it("libera tudo o que seria liberado, na ordem, menos título diferente do item", () => {
    const escolha = escolherDesenhosAutomaticos(simulacao, null);
    expect(escolha.liberar).toEqual(["D1", "D4"]);
    expect(escolha.deFora.map((x) => x.desenhoPhysicalId)).toEqual(["D3"]);
    expect(escolha.bloqueio).toBeNull();
  });

  it("erro na busca de desenhos ou desenho com erro trava tudo", () => {
    const comErroNaBusca = escolherDesenhosAutomaticos(simulacao, "Itens com erro na busca de desenhos: X");
    expect(comErroNaBusca.liberar).toEqual([]);
    expect(comErroNaBusca.bloqueio).toMatch(/busca de desenhos/);

    const comDesenhoComErro = escolherDesenhosAutomaticos([...simulacao, d("D5", "312", "312", "erro")], null);
    expect(comDesenhoComErro.liberar).toEqual([]);
    expect(comDesenhoComErro.bloqueio).toMatch(/1 desenho/);
  });

  it("título igual ao item ignora maiúsculas e espaços; sem título não alerta", () => {
    expect(tituloDiferenteDoItem({ itemCodigo: "a12 ", desenhoTitulo: "A12" })).toBe(false);
    expect(tituloDiferenteDoItem({ itemCodigo: "A12", desenhoTitulo: null })).toBe(false);
  });
});

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
