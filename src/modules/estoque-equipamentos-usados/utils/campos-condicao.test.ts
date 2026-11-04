import { describe, expect, it } from "vitest";

import { camposParaCondicao } from "./campos-condicao";

const campos = [
  { chave: "sistemaNomeCliente", condicao: "usado" as const, obrigatorio: true, obrigatorioNovo: true },
  { chave: "sistemaValor", condicao: "ambos" as const, obrigatorio: true, obrigatorioNovo: false },
  { chave: "sistemaDescricao", condicao: "ambos" as const, obrigatorio: true, obrigatorioNovo: true },
  { chave: "lote", condicao: "novo" as const, obrigatorio: false, obrigatorioNovo: true },
];

describe("camposParaCondicao", () => {
  it("usado: tira o campo só de novos e mantém o obrigatório de sempre", () => {
    const r = camposParaCondicao(campos, "usado");
    expect(r.map((c) => c.chave)).toEqual(["sistemaNomeCliente", "sistemaValor", "sistemaDescricao"]);
    expect(r.find((c) => c.chave === "sistemaValor")?.obrigatorio).toBe(true);
  });

  it("novo: sem o Cliente, Valor opcional, campo só de novos com o obrigatório do novo", () => {
    const r = camposParaCondicao(campos, "novo");
    expect(r.map((c) => c.chave)).toEqual(["sistemaValor", "sistemaDescricao", "lote"]);
    expect(r.find((c) => c.chave === "sistemaValor")?.obrigatorio).toBe(false);
    expect(r.find((c) => c.chave === "sistemaDescricao")?.obrigatorio).toBe(true);
    expect(r.find((c) => c.chave === "lote")?.obrigatorio).toBe(true);
  });

  it("não altera a lista original", () => {
    camposParaCondicao(campos, "novo");
    expect(campos[1].obrigatorio).toBe(true);
  });
});
