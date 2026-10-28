import { describe, expect, it } from "vitest";

import {
  escolherAlcada,
  escolherSugestao,
  etapasIniciais,
  lerPrefixos,
  maioriaNosCentrosDeCusto,
  transicionar,
  type EtapaEstado,
} from "./regras";

describe("escolherAlcada", () => {
  const padrao = { id: "padrao", empresa: null, setor: null };
  const usitec = { id: "usitec", empresa: 30, setor: null };
  const manutencao = { id: "manutencao", empresa: null, setor: "Manutenção" };
  const usitecManutencao = { id: "usitec-manutencao", empresa: 30, setor: "MANUTENÇÃO" };
  const todas = [padrao, usitec, manutencao, usitecManutencao];

  it("empresa + setor vence tudo", () => {
    expect(escolherAlcada(todas, { empresa: 30, setor: "manutenção" })?.id).toBe("usitec-manutencao");
  });

  it("só empresa vence só setor", () => {
    expect(escolherAlcada([padrao, usitec, manutencao], { empresa: 30, setor: "Manutenção" })?.id).toBe("usitec");
  });

  it("só setor vence o padrão", () => {
    expect(escolherAlcada(todas, { empresa: 2, setor: " Manutenção " })?.id).toBe("manutencao");
  });

  it("sem regra específica, cai no padrão do tipo", () => {
    expect(escolherAlcada(todas, { empresa: 2, setor: "Pintura" })?.id).toBe("padrao");
    expect(escolherAlcada(todas, { empresa: null, setor: null })?.id).toBe("padrao");
  });

  it("regra de outra empresa nunca casa", () => {
    expect(escolherAlcada([usitec], { empresa: 2, setor: null })).toBeNull();
  });

  it("regra com setor não casa solicitação sem setor", () => {
    expect(escolherAlcada([manutencao], { empresa: 2, setor: null })).toBeNull();
  });

  it("sem nenhuma regra, null", () => {
    expect(escolherAlcada([], { empresa: 2, setor: "x" })).toBeNull();
  });
});

describe("etapasIniciais", () => {
  it("primeiro nível pendente, os demais aguardando, em ordem", () => {
    const etapas = etapasIniciais([
      { ordem: 2, nome: "Diretor" },
      { ordem: 1, nome: "Gerente" },
      { ordem: 3, nome: "Presidência" },
    ]);
    expect(etapas.map((e) => [e.nome, e.status])).toEqual([
      ["Gerente", "pendente"],
      ["Diretor", "aguardando"],
      ["Presidência", "aguardando"],
    ]);
  });
});

describe("transicionar", () => {
  const cadeia = (...status: EtapaEstado["status"][]): EtapaEstado[] =>
    status.map((s, i) => ({ id: `e${i + 1}`, ordem: i + 1, status: s }));

  it("aprovar no nível 1 sobe para o nível 2", () => {
    const t = transicionar(cadeia("pendente", "aguardando", "aguardando"), "aprovar")!;
    expect(t.resultado).toBe("avancou");
    expect(t.decidida.id).toBe("e1");
    expect(t.proxima?.id).toBe("e2");
    expect(t.mudancas).toEqual([
      { id: "e1", status: "aprovado" },
      { id: "e2", status: "pendente" },
    ]);
  });

  it("aprovar no último nível aprova a solicitação", () => {
    const t = transicionar(cadeia("aprovado", "aprovado", "pendente"), "aprovar")!;
    expect(t.resultado).toBe("aprovado");
    expect(t.proxima).toBeNull();
    expect(t.mudancas).toEqual([{ id: "e3", status: "aprovado" }]);
  });

  it("cadeia de um nível só aprova direto", () => {
    expect(transicionar(cadeia("pendente"), "aprovar")!.resultado).toBe("aprovado");
  });

  it("devolver encerra os níveis que ainda aguardavam", () => {
    const t = transicionar(cadeia("aprovado", "pendente", "aguardando"), "devolver")!;
    expect(t.resultado).toBe("devolvido");
    expect(t.mudancas).toEqual([
      { id: "e2", status: "devolvido" },
      { id: "e3", status: "encerrado" },
    ]);
  });

  it("não decide o que já terminou ou foi devolvido", () => {
    expect(transicionar(cadeia("aprovado", "aprovado"), "aprovar")).toBeNull();
    expect(transicionar(cadeia("devolvido", "encerrado"), "aprovar")).toBeNull();
    expect(transicionar([], "aprovar")).toBeNull();
  });

  it("usa a ordem e não a posição na lista", () => {
    const etapas: EtapaEstado[] = [
      { id: "b", ordem: 2, status: "aguardando" },
      { id: "a", ordem: 1, status: "pendente" },
    ];
    expect(transicionar(etapas, "aprovar")!.proxima?.id).toBe("b");
  });
});

describe("sugestão de direcionamento", () => {
  const regras = [
    { id: "darlan", empresa: 40, centrosCusto: null, usuarioId: "D", ordem: 1 },
    { id: "airton", empresa: 30, centrosCusto: null, usuarioId: "A", ordem: 2 },
    { id: "marciano", empresa: 2, centrosCusto: "90.02, 90.90", usuarioId: "M", ordem: 3 },
    { id: "todos-2", empresa: 2, centrosCusto: null, usuarioId: null, ordem: 4 },
  ];

  it("por empresa", () => {
    expect(escolherSugestao(regras, { empresa: 40, centrosCustoItens: [] })?.id).toBe("darlan");
    expect(escolherSugestao(regras, { empresa: 30, centrosCustoItens: ["9002204"] })?.id).toBe("airton");
  });

  it("empresa 2 com a maioria dos itens em 90.02/90.90 vai para o Marciano", () => {
    expect(escolherSugestao(regras, { empresa: 2, centrosCustoItens: ["9002204", "9090582", "1234"] })?.id).toBe("marciano");
  });

  it("metade exata não é maioria: fica para todos", () => {
    expect(escolherSugestao(regras, { empresa: 2, centrosCustoItens: ["9002204", "1234"] })?.id).toBe("todos-2");
  });

  it("empresa 2 sem centro de custo, ou sem itens, fica para todos", () => {
    expect(escolherSugestao(regras, { empresa: 2, centrosCustoItens: ["5500"] })?.usuarioId).toBeNull();
    expect(escolherSugestao(regras, { empresa: 2, centrosCustoItens: [] })?.id).toBe("todos-2");
  });

  it("empresa sem regra: nenhuma sugestão", () => {
    expect(escolherSugestao(regras, { empresa: 99, centrosCustoItens: [] })).toBeNull();
  });

  it("prefixo compara pelos dígitos, com ou sem ponto", () => {
    expect(maioriaNosCentrosDeCusto(["90.02.204"], lerPrefixos("9002"))).toBe(true);
    expect(maioriaNosCentrosDeCusto(["9100204"], lerPrefixos("90.02"))).toBe(false);
    expect(lerPrefixos(" 90.02 ; 90.90 ,")).toEqual(["9002", "9090"]);
  });
});
