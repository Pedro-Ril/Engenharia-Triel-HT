import { describe, expect, it } from "vitest";

import {
  codificarRequisicao,
  decodificarResposta,
  descreverStatus,
  estadoDoTrabalho,
  normalizarImpressaoDigital,
  statusOk,
} from "./ipp";

/* Monta uma resposta IPP à mão: cabeçalho + grupos + fim. */
function resposta(status: number, corpo: number[]): Buffer {
  return Buffer.from([0x01, 0x01, status >> 8, status & 0xff, 0, 0, 0, 1, ...corpo, 0x03]);
}

function attr(tag: number, nome: string, valor: Buffer | string): number[] {
  const n = Buffer.from(nome);
  const v = typeof valor === "string" ? Buffer.from(valor) : valor;
  return [tag, n.length >> 8, n.length & 0xff, ...n, v.length >> 8, v.length & 0xff, ...v];
}

function int(valor: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeInt32BE(valor);
  return b;
}

describe("codificarRequisicao", () => {
  it("põe charset e idioma primeiro e separa os grupos", () => {
    const buf = codificarRequisicao({
      operacao: 0x0002,
      idRequisicao: 7,
      operacaoAttrs: [{ tag: 0x45, nome: "printer-uri", valores: ["ipps://10.0.0.1:631/ipp/print"] }],
      trabalhoAttrs: [{ tag: 0x21, nome: "copies", valores: [3] }],
    });
    expect([...buf.subarray(0, 8)]).toEqual([1, 1, 0, 2, 0, 0, 0, 7]);
    expect(buf[8]).toBe(0x01);
    expect(buf.indexOf("attributes-charset")).toBeLessThan(buf.indexOf("attributes-natural-language"));
    expect(buf.indexOf("attributes-natural-language")).toBeLessThan(buf.indexOf("printer-uri"));
    const grupoTrabalho = buf.indexOf(Buffer.from([0x02, 0x21]));
    expect(grupoTrabalho).toBeGreaterThan(buf.indexOf("printer-uri"));
    expect(buf.readInt32BE(buf.indexOf("copies") + 6 + 2)).toBe(3);
    expect(buf.at(-1)).toBe(0x03);
  });

  it("codifica atributo com vários valores (nome vazio a partir do 2º)", () => {
    const buf = codificarRequisicao({
      operacao: 0x000b,
      idRequisicao: 1,
      operacaoAttrs: [{ tag: 0x44, nome: "requested-attributes", valores: ["a", "bb"] }],
    });
    const decod = decodificarResposta(buf);
    expect(decod.atributos["requested-attributes"]).toEqual(["a", "bb"]);
  });
});

describe("decodificarResposta", () => {
  it("lê status, inteiros, enums, booleanos e textos", () => {
    const buf = resposta(0x0000, [
      0x01,
      ...attr(0x47, "attributes-charset", "utf-8"),
      0x02,
      ...attr(0x21, "job-id", int(42)),
      ...attr(0x23, "job-state", int(9)),
      ...attr(0x22, "printer-is-accepting-jobs", Buffer.from([1])),
      ...attr(0x44, "job-state-reasons", "job-completed-successfully"),
    ]);
    const r = decodificarResposta(buf);
    expect(r.status).toBe(0);
    expect(r.atributos["job-id"]).toEqual([42]);
    expect(r.atributos["job-state"]).toEqual([9]);
    expect(r.atributos["printer-is-accepting-jobs"]).toEqual([true]);
    expect(r.atributos["job-state-reasons"]).toEqual(["job-completed-successfully"]);
  });

  it("pula coleções sem bagunçar o atributo seguinte", () => {
    const buf = resposta(0x0000, [
      0x04,
      ...attr(0x34, "media-col-default", ""),
      ...attr(0x4a, "", "media-size"),
      ...attr(0x34, "", ""),
      ...attr(0x4a, "", "x-dimension"),
      ...attr(0x21, "", int(21000)),
      ...attr(0x37, "", ""),
      ...attr(0x37, "", ""),
      ...attr(0x23, "printer-state", int(3)),
    ]);
    const r = decodificarResposta(buf);
    expect(r.atributos["printer-state"]).toEqual([3]);
    expect(r.atributos["media-col-default"]).toBeUndefined();
  });

  it("recusa resposta curta", () => {
    expect(() => decodificarResposta(Buffer.from([1, 1, 0]))).toThrow();
  });
});

describe("auxiliares", () => {
  it("statusOk só aceita a faixa 0x00xx", () => {
    expect(statusOk(0x0000)).toBe(true);
    expect(statusOk(0x0001)).toBe(true);
    expect(statusOk(0x040a)).toBe(false);
    expect(descreverStatus(0x040a)).toBe("formato de documento não suportado (0x040a)");
    expect(descreverStatus(0x0999)).toBe("status IPP 0x0999");
  });

  it("traduz job-state", () => {
    expect(estadoDoTrabalho(3)).toBe("na_fila");
    expect(estadoDoTrabalho(5)).toBe("imprimindo");
    expect(estadoDoTrabalho(7)).toBe("cancelado");
    expect(estadoDoTrabalho(8)).toBe("erro");
    expect(estadoDoTrabalho(9)).toBe("impresso");
    expect(estadoDoTrabalho(undefined)).toBeNull();
  });

  it("normaliza impressão digital com ou sem dois-pontos", () => {
    expect(normalizarImpressaoDigital("84:01:94:ab")).toBe("840194AB");
    expect(normalizarImpressaoDigital(" 840194ab ")).toBe("840194AB");
  });
});
