import { describe, expect, it } from "vitest";

import { descreverPoliticaSenha, regrasPoliticaSenha } from "./politica-senha";

describe("regrasPoliticaSenha", () => {
  it("descreve a política atual do domínio (7 caracteres, histórico 24, sem complexidade)", () => {
    expect(
      regrasPoliticaSenha({ tamanhoMinimo: 7, exigeComplexidade: false, historico: 24, validadeDias: 180 })
    ).toEqual(["Pelo menos 7 caracteres", "Diferente das suas últimas 24 senhas"]);
  });

  it("inclui as regras de complexidade quando o domínio exige", () => {
    const regras = regrasPoliticaSenha({ tamanhoMinimo: 8, exigeComplexidade: true, historico: 1, validadeDias: 0 });

    expect(regras).toHaveLength(4);
    expect(regras[1]).toMatch(/3 destes 4 tipos/);
    expect(regras[3]).toBe("Diferente da senha anterior");
  });

  it("sem nenhuma regra devolve lista vazia", () => {
    expect(
      regrasPoliticaSenha({ tamanhoMinimo: 0, exigeComplexidade: false, historico: 0, validadeDias: 0 })
    ).toEqual([]);
  });
});

describe("descreverPoliticaSenha", () => {
  it("monta uma frase a partir das regras", () => {
    expect(
      descreverPoliticaSenha({ tamanhoMinimo: 7, exigeComplexidade: false, historico: 24, validadeDias: 180 })
    ).toBe("Regras da senha: pelo menos 7 caracteres; diferente das suas últimas 24 senhas.");
  });

  it("sem política conhecida devolve um texto genérico", () => {
    expect(descreverPoliticaSenha(null)).toMatch(/regras de senha da rede/);
  });
});
