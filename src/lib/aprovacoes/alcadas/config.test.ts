import { describe, expect, it } from "vitest";

import { ValidationError } from "@/lib/auth/errors";

import { validarDadosAlcada, type DadosAlcada, type DadosSugestao } from "./config";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";
const C = "33333333-3333-3333-3333-333333333333";

function dados(parcial: Partial<DadosAlcada> = {}): DadosAlcada {
  return {
    tipo: "pedido_compra",
    empresa: 2,
    setor: null,
    niveis: [
      { nome: "Gerente", usuarioIds: [A] },
      { nome: "Diretor", usuarioIds: [B, C] },
    ],
    sugestoes: [],
    ...parcial,
  };
}

describe("validarDadosAlcada", () => {
  it("aceita uma alçada válida e limpa os textos", () => {
    const v = validarDadosAlcada(
      dados({ tipo: "aumento_salarial", empresa: null, setor: "  Manutenção ", niveis: [{ nome: " Gerente ", usuarioIds: [A, A] }] })
    );
    expect(v.setor).toBe("Manutenção");
    expect(v.niveis).toEqual([{ id: undefined, nome: "Gerente", usuarioIds: [A] }]);
  });

  it("recusa o critério que o tipo não usa", () => {
    expect(() => validarDadosAlcada(dados({ tipo: "pedido_compra", setor: "Manutenção" }))).toThrow(/não usa setor/);
    expect(() => validarDadosAlcada(dados({ tipo: "aumento_salarial", empresa: 2 }))).toThrow(/não usa empresa/);
  });

  it("setor só com espaços vira 'qualquer setor'", () => {
    expect(validarDadosAlcada(dados({ setor: "   " })).setor).toBeNull();
  });

  it("recusa tipo desconhecido", () => {
    expect(() => validarDadosAlcada(dados({ tipo: "ferias" }))).toThrow(ValidationError);
  });

  it("recusa empresa inválida", () => {
    expect(() => validarDadosAlcada(dados({ empresa: 0 }))).toThrow(/Empresa/);
    expect(() => validarDadosAlcada(dados({ empresa: 1.5 }))).toThrow(/Empresa/);
  });

  it("precisa de pelo menos um nível e no máximo dez", () => {
    expect(() => validarDadosAlcada(dados({ niveis: [] }))).toThrow(/pelo menos um nível/);
    const onze = Array.from({ length: 11 }, (_, i) => ({ nome: `N${i}`, usuarioIds: [`${i}`] }));
    expect(() => validarDadosAlcada(dados({ niveis: onze }))).toThrow(/no máximo 10/);
  });

  it("cada nível precisa de nome e de aprovador", () => {
    expect(() => validarDadosAlcada(dados({ niveis: [{ nome: " ", usuarioIds: [A] }] }))).toThrow(/nome ao nível 1/);
    expect(() => validarDadosAlcada(dados({ niveis: [{ nome: "Gerente", usuarioIds: [] }] }))).toThrow(
      /pelo menos um aprovador/
    );
  });

  it("a mesma pessoa não pode estar em dois níveis", () => {
    expect(() =>
      validarDadosAlcada(
        dados({
          niveis: [
            { nome: "Gerente", usuarioIds: [A] },
            { nome: "Diretor", usuarioIds: [A, B] },
          ],
        })
      )
    ).toThrow(/dois níveis/);
  });
});

describe("sugestões de direcionamento", () => {
  const sugestao = (parcial: Partial<DadosSugestao> = {}): DadosSugestao => ({
    nivelIndice: 1,
    empresa: null,
    centrosCusto: null,
    usuarioId: B,
    ...parcial,
  });
  const comSugestoes = (...sugestoes: DadosSugestao[]) => dados({ empresa: null, sugestoes });

  it("aceita pessoa do nível ou 'todos', e normaliza os centros de custo", () => {
    const v = validarDadosAlcada(
      comSugestoes(
        sugestao({ empresa: 2, centrosCusto: " 90.02;90.90 ,", usuarioId: C }),
        sugestao({ empresa: 2, usuarioId: null })
      )
    );
    expect(v.sugestoes).toEqual([
      { nivelIndice: 1, empresa: 2, centrosCusto: "90.02, 90.90", usuarioId: C },
      { nivelIndice: 1, empresa: 2, centrosCusto: null, usuarioId: null },
    ]);
  });

  it("a pessoa sugerida tem que ser aprovadora do nível", () => {
    expect(() => validarDadosAlcada(comSugestoes(sugestao({ usuarioId: A })))).toThrow(/aprovadora do nível "Diretor"/);
  });

  it("não direciona para o 1º nível nem para nível que não existe", () => {
    expect(() => validarDadosAlcada(comSugestoes(sugestao({ nivelIndice: 0 })))).toThrow(/a partir do 2º/);
    expect(() => validarDadosAlcada(comSugestoes(sugestao({ nivelIndice: 2 })))).toThrow(/a partir do 2º/);
  });

  it("empresa da sugestão tem que caber na alçada", () => {
    expect(() => validarDadosAlcada(dados({ empresa: 2, sugestoes: [sugestao({ empresa: 30 })] }))).toThrow(
      /só vale para a empresa 2/
    );
    expect(() =>
      validarDadosAlcada(
        dados({ tipo: "aumento_salarial", empresa: null, sugestoes: [sugestao({ empresa: 2 })] })
      )
    ).toThrow(/não usa empresa/);
  });

  it("centro de custo só no tipo que tem, e com número", () => {
    expect(() =>
      validarDadosAlcada(dados({ tipo: "aumento_salarial", empresa: null, sugestoes: [sugestao({ centrosCusto: "90.02" })] }))
    ).toThrow(/não tem centro de custo/);
    expect(() => validarDadosAlcada(comSugestoes(sugestao({ centrosCusto: "abc" })))).toThrow(/com números/);
  });

  it("recusa duas sugestões para a mesma combinação", () => {
    expect(() =>
      validarDadosAlcada(
        comSugestoes(sugestao({ empresa: 2, centrosCusto: "90.90, 90.02" }), sugestao({ empresa: 2, centrosCusto: "9002;9090", usuarioId: C }))
      )
    ).toThrow(/repete/);
  });
});
