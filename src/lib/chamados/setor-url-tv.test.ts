import { describe, expect, it } from "vitest";

import { encontrarSetorDaUrl, normalizarTextoUrl } from "./setor-url-tv";

const SETORES = [
  { id: "3deae3a8-bd1d-4072-97d3-199566dc91c5", chave: "chamados", nome: "TI" },
  { id: "cd04536c-4b0c-4fcd-826f-8116848f27de", chave: "manutencao", nome: "Manutenção" },
  { id: "11111111-2222-3333-4444-555555555555", chave: "eng-manufatura", nome: "Engenharia de Manufatura" },
];

describe("normalizarTextoUrl", () => {
  it("tira acento, maiúscula e troca espaço por hífen", () => {
    expect(normalizarTextoUrl("Manutenção Elétrica")).toBe("manutencao-eletrica");
    expect(normalizarTextoUrl("  TI  ")).toBe("ti");
    expect(normalizarTextoUrl("Engenharia de Manufatura")).toBe("engenharia-de-manufatura");
  });
});

describe("encontrarSetorDaUrl", () => {
  it("acha pelo nome, sem diferenciar maiúscula e acento", () => {
    expect(encontrarSetorDaUrl("ti", SETORES)?.nome).toBe("TI");
    expect(encontrarSetorDaUrl("TI", SETORES)?.nome).toBe("TI");
    expect(encontrarSetorDaUrl("manutencao", SETORES)?.nome).toBe("Manutenção");
    expect(encontrarSetorDaUrl("Manutenção", SETORES)?.nome).toBe("Manutenção");
    expect(encontrarSetorDaUrl("engenharia-de-manufatura", SETORES)?.nome).toBe("Engenharia de Manufatura");
  });

  it("acha pela chave cadastrada", () => {
    expect(encontrarSetorDaUrl("chamados", SETORES)?.nome).toBe("TI");
    expect(encontrarSetorDaUrl("eng-manufatura", SETORES)?.nome).toBe("Engenharia de Manufatura");
  });

  it("acha pelo id (links antigos), sem diferenciar maiúscula", () => {
    expect(encontrarSetorDaUrl("3deae3a8-bd1d-4072-97d3-199566dc91c5", SETORES)?.nome).toBe("TI");
    expect(encontrarSetorDaUrl("3DEAE3A8-BD1D-4072-97D3-199566DC91C5", SETORES)?.nome).toBe("TI");
  });

  it("não acha: devolve null (a TV avisa em vez de mostrar todos)", () => {
    expect(encontrarSetorDaUrl("financeiro", SETORES)).toBeNull();
    expect(encontrarSetorDaUrl("99999999-2222-3333-4444-555555555555", SETORES)).toBeNull();
    expect(encontrarSetorDaUrl("   ", SETORES)).toBeNull();
    expect(encontrarSetorDaUrl("---", SETORES)).toBeNull();
  });
});
