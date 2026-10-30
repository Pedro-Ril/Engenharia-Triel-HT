import { describe, expect, it } from "vitest";

import { deduplicarClientesErp, selecionarNfEntrada, type CandidatoNfEntrada } from "./erp-integracao";

function nf(numeroNf: string, fornecedorDescricao: string, fornecedorCnpj: string | null, mascara: string): CandidatoNfEntrada {
  return {
    numeroNf,
    dataEntradaIso: "2026-10-01",
    dataEntradaOriginal: "01/10/2026",
    codigoItem: "6878",
    idConfigurado: `id-${numeroNf}`,
    mascara,
    fornecedorCodigo: "1",
    fornecedorDescricao,
    fornecedorCnpj,
  };
}

/* Caso real do 980: cliente pessoa física (sem CNPJ no ERP), 5 NFs com máscara compatível. */
const CANDIDATAS_980 = [
  nf("16185", "MURILO DA SILVEIRA COELHO", null, "MEGA#ACO#980"),
  nf("74682", "CIBER EQUIPAMENTOS RODOVIÁRIOS LTDA", "11111111000111", "X#980"),
  nf("768575", "DANILO MARCOLINO FACCIO", null, "Y#980"),
  nf("36307", "DANILO MARCOLINO FACCIO", null, "Z#980"),
  nf("66", "REFORMAK IND METALURGICA E REFORMADORA LTDA", "22222222000122", "W#980"),
];

/* Caso real do 829: 3 NFs do mesmo cliente (mesmo CNPJ). */
const CANDIDATAS_829 = [
  nf("117", "PICINATTO TRANSPORTES RODOVIARIOS LTDA.", "33333333000133", "A#829"),
  nf("133", "PICINATTO TRANSPORTES RODOVIARIOS LTDA.", "33333333000133", "B#829"),
  nf("106", "PICINATTO TRANSPORTES RODOVIARIOS LTDA.", "33333333000133", "C#829"),
];

describe("selecionarNfEntrada — desempate pela NF digitada", () => {
  it("sem a NF digitada continua ambíguo (comportamento de antes)", () => {
    expect(selecionarNfEntrada(CANDIDATAS_980, { chaveMascara: "980", cnpjCliente: null }).tipo).toBe("ambiguo");
    expect(selecionarNfEntrada(CANDIDATAS_829, { chaveMascara: "829", cnpjCliente: "33333333000133" }).tipo).toBe("ambiguo");
  });

  it("cliente sem CNPJ: NF digitada + mesmo nome (sem acento/caixa) escolhe a nota", () => {
    const r = selecionarNfEntrada(CANDIDATAS_980, {
      chaveMascara: "980",
      cnpjCliente: null,
      numeroNfDigitado: "16185",
      nomeCliente: "Murilo da Silveira Coelho",
    });
    expect(r).toMatchObject({ tipo: "unico", nf: { numeroNf: "16185" }, confirmadoPorCnpj: false });
  });

  it("cliente com CNPJ: NF digitada + mesmo CNPJ escolhe entre as várias do cliente", () => {
    const r = selecionarNfEntrada(CANDIDATAS_829, {
      chaveMascara: "829",
      cnpjCliente: "33333333000133",
      numeroNfDigitado: "0117",
      nomeCliente: "PICINATTO",
    });
    expect(r).toMatchObject({ tipo: "unico", nf: { numeroNf: "117" }, confirmadoPorCnpj: true });
  });

  it("NF digitada de outro cliente não é usada", () => {
    const r = selecionarNfEntrada(CANDIDATAS_980, {
      chaveMascara: "980",
      cnpjCliente: null,
      numeroNfDigitado: "74682",
      nomeCliente: "MURILO DA SILVEIRA COELHO",
    });
    expect(r.tipo).toBe("ambiguo");
  });

  it("NF digitada que não está entre as candidatas não muda nada", () => {
    const r = selecionarNfEntrada(CANDIDATAS_829, {
      chaveMascara: "829",
      cnpjCliente: "33333333000133",
      numeroNfDigitado: "999",
      nomeCliente: null,
    });
    expect(r.tipo).toBe("ambiguo");
  });
});

describe("deduplicarClientesErp", () => {
  it("remove repetidas, descarta a sem documento e mantém filiais", () => {
    const r = deduplicarClientesErp([
      { cod_cli: "77947", descricao: "MURILO DA SILVEIRA COELHO", cnpj: null },
      { cod_cli: "77947", descricao: "MURILO DA SILVEIRA COELHO", cnpj: null },
      { cod_cli: "77947", descricao: "MURILO DA SILVEIRA COELHO", cnpj: null },
      { cod_cli: "128", descricao: "MAGNABOSCO", cnpj: null },
      { cod_cli: "128", descricao: "MAGNABOSCO", cnpj: "75813923000323" },
      { cod_cli: "127", descricao: "MAGNABOSCO", cnpj: "75813923000161" },
      { cod_cli: "127", descricao: "MAGNABOSCO", cnpj: "75813923000757" },
      { cod_cli: "127", descricao: "MAGNABOSCO", cnpj: "75813923000161" },
    ]);
    expect(r.filter((c) => c.cod_cli === "77947")).toHaveLength(1);
    expect(r.filter((c) => c.cod_cli === "128")).toEqual([{ cod_cli: "128", descricao: "MAGNABOSCO", cnpj: "75813923000323" }]);
    expect(r.filter((c) => c.cod_cli === "127").map((c) => c.cnpj)).toEqual(["75813923000161", "75813923000757"]);
  });
});
