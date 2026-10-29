import { describe, expect, it } from "vitest";

import {
  arquivosDoCodigo,
  lerAba,
  montarPlano,
  nomeDaLista,
  numeroDoProjeto,
  pastasDoProjeto,
} from "./separacao-regras";

describe("numeroDoProjeto / pastasDoProjeto", () => {
  it("pega o número antes do hífen no nome do arquivo", () => {
    expect(numeroDoProjeto("1111 - CAÇAMBA STANDARD 14M3 - SULPASSOS.xls")).toBe("1111");
    expect(numeroDoProjeto("C:\\x\\969- CAÇAMBA.xlsx")).toBe("969");
    expect(numeroDoProjeto("CAÇAMBA 1111.xls")).toBeNull();
  });

  it("acha a pasta do projeto pelo número + hífen, sem confundir 111 com 1111", () => {
    const raiz = ["111 - OUTRO", "1111 - TESTE", "11110 - MAIS UM", "TESTE MONTAGEM"];
    expect(pastasDoProjeto(raiz, "1111")).toEqual(["1111 - TESTE"]);
    expect(pastasDoProjeto(["005 - CAÇAMBA (DIPESUL)"], "5")).toEqual(["005 - CAÇAMBA (DIPESUL)"]);
  });
});

describe("lerAba", () => {
  it("lê título, cabeçalho Nº DA PEÇA e códigos; ignora total e repetidos", () => {
    const aba = lerAba("CHAPARIA", [
      ["LISTA CHAPARIA 969 - CAÇAMBA STANDARD 14M3 - SULPASSOS", "", ""],
      ["Nº DO \nITEM", "Nº DA \nPEÇA", "MATERIAL"],
      ["1", 20016668, "CHAPA"],
      ["2", 20017401, "CHAPA"],
      ["3", 20016668, "CHAPA"],
      ["", "", "", "Peso total", 3495.2],
    ]);
    expect(aba.listas).toEqual([
      {
        titulo: "LISTA CHAPARIA 969 - CAÇAMBA STANDARD 14M3 - SULPASSOS",
        nome: "CHAPARIA",
        codigos: ["20016668", "20017401"],
        pesos: { "20016668": null, "20017401": null },
      },
    ]);
  });

  it("aba com dois blocos vira duas listas com o nome do título", () => {
    const aba = lerAba("USINAGEM", [
      ["LISTA USINAGEM COMUM 969 - CAÇAMBA"],
      ["Nº DO ITEM", "Nº DA PEÇA"],
      ["1", 20016703],
      ["", "", "", "", "", "Peso total", 33.4],
      [],
      ["LISTA USINAGEM NYLON 969 - CAÇAMBA"],
      ["Nº DO ITEM", "Nº DA PEÇA"],
      ["1", 20018364],
    ]);
    expect(aba.listas.map((l) => [l.nome, l.codigos])).toEqual([
      ["USINAGEM COMUM", ["20016703"]],
      ["USINAGEM NYLON", ["20018364"]],
    ]);
  });

  it("lê o peso unitário (coluna Peso, não Peso total), aceitando vírgula", () => {
    const aba = lerAba("COMPRADOS", [
      ["Nº DO ITEM", "Nº DA PEÇA", "MATERIAL", "Description", "QTD.", "Peso", "Peso total"],
      ["1", 20008435, "", "", 1, 0.332, ""],
      ["2", 20032274, "", "", 1, "0,12922", ""],
      ["3", 20009453, "", "", 1, "", ""],
    ]);
    expect(aba.listas[0].pesos).toEqual({ "20008435": 0.332, "20032274": 0.12922, "20009453": null });
  });

  it("sem cabeçalho reconhecido, nenhuma lista", () => {
    expect(lerAba("MESTRA", [["1", 20035505, ""]]).listas).toEqual([]);
  });

  it("nome da lista sem número do projeto", () => {
    expect(nomeDaLista("LISTA COMPRADOS")).toBe("COMPRADOS");
  });
});

describe("arquivosDoCodigo", () => {
  const origem = ["20010094.pdf", "20010094_2.pdf", "20010094_1.PDF", "200100941.pdf", "20010096 - Copia.dxf", "20010096.DXF"];

  it("principal + folhas em ordem, extensão sem caixa", () => {
    expect(arquivosDoCodigo(origem, "20010094", "pdf")).toEqual(["20010094.pdf", "20010094_1.PDF", "20010094_2.pdf"]);
  });

  it("ignora cópia do Windows e aceita .DXF", () => {
    expect(arquivosDoCodigo(origem, "20010096", "dxf")).toEqual(["20010096.DXF"]);
  });
});

describe("montarPlano", () => {
  const abas = [
    lerAba("original", [["Nº DO ITEM", "Código"], ["1", 1]]),
    lerAba("MESTRA", [["1", 1]]),
    lerAba("CHAPARIA", [["LISTA CHAPARIA 969 - X"], ["Nº DO ITEM", "Nº DA PEÇA"], ["1", 100], ["2", 101]]),
    lerAba("USINAGEM", [
      ["LISTA USINAGEM COMUM 969 - X"], ["Nº DO ITEM", "Nº DA PEÇA"], ["1", 200],
      ["LISTA USINAGEM NYLON 969 - X"], ["Nº DO ITEM", "Nº DA PEÇA"], ["1", 201],
    ]),
    lerAba("COMPRADOS", [["LISTA COMPRADOS 969 - X"], ["Nº DO ITEM", "Nº DA PEÇA"], ["1", 900]]),
  ];

  const plano = montarPlano({
    abas,
    blacklist: ["Original", "mestra"],
    abasComDxf: ["CHAPARIA"],
    arquivosPdf: ["100.pdf", "101.pdf", "101_1.pdf", "200.pdf", "201.pdf"],
    arquivosDxf: ["100.dxf"],
    existentesNoDestino: new Map([["CHAPARIA", new Set(["100.pdf"])]]),
  });

  it("blacklist e aba sem arquivo ficam de fora (e sem pasta)", () => {
    expect(plano.abasIgnoradas).toEqual([
      { aba: "original", motivo: "blacklist", itens: 0 },
      { aba: "MESTRA", motivo: "blacklist", itens: 0 },
      { aba: "COMPRADOS", motivo: "sem_arquivos", itens: 1 },
    ]);
    expect(plano.pastas.some((p) => p.caminho === "COMPRADOS")).toBe(false);
    expect(plano.itens.some((i) => i.aba === "COMPRADOS")).toBe(false);
  });

  it("CHAPARIA: PDF + DXF; arquivo que já existe não é copiado; DXF faltando aparece", () => {
    const chaparia = plano.itens.filter((i) => i.aba === "CHAPARIA").map((i) => `${i.arquivo ?? i.codigo + "." + i.tipo}:${i.situacao}`);
    expect(chaparia).toEqual([
      "100.pdf:ja_existe",
      "100.dxf:copiar",
      "101.pdf:copiar",
      "101_1.pdf:copiar",
      "101.dxf:nao_encontrado",
    ]);
    expect(plano.pastas.find((p) => p.caminho === "CHAPARIA")).toEqual({ caminho: "CHAPARIA", existe: true, criar: false });
  });

  it("aba cujo nome some ao limpar (\"...\") é ignorada: nunca copia na raiz do projeto", () => {
    const p = montarPlano({
      abas: [lerAba("...", [["Nº DO ITEM", "Nº DA PEÇA"], ["1", 100]])],
      blacklist: [],
      abasComDxf: [],
      arquivosPdf: ["100.pdf"],
      arquivosDxf: [],
      existentesNoDestino: new Map([["", new Set<string>()]]),
    });
    expect(p.abasIgnoradas).toEqual([{ aba: "...", motivo: "nome_invalido", itens: 0 }]);
    expect(p.itens).toEqual([]);
    expect(p.pastas).toEqual([]);
  });

  it("USINAGEM com dois blocos: pasta da aba + uma subpasta por bloco, só PDF", () => {
    expect(plano.pastas.filter((p) => p.caminho.startsWith("USINAGEM")).map((p) => [p.caminho, p.criar])).toEqual([
      ["USINAGEM", true],
      ["USINAGEM\\USINAGEM COMUM", true],
      ["USINAGEM\\USINAGEM NYLON", true],
    ]);
    expect(plano.itens.filter((i) => i.aba === "USINAGEM").every((i) => i.tipo === "pdf")).toBe(true);
  });
});
