import { describe, expect, it } from "vitest";

import { lerDimensoesPng } from "./rubricas-png";

/* Cabeçalho mínimo de PNG: assinatura + bloco IHDR com largura e altura. */
function cabecalhoPng(largura: number, altura: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const leitor = new DataView(bytes.buffer);
  leitor.setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  leitor.setUint32(16, largura);
  leitor.setUint32(20, altura);
  return bytes;
}

describe("lerDimensoesPng", () => {
  it("lê largura e altura do IHDR", () => {
    expect(lerDimensoesPng(cabecalhoPng(600, 200))).toEqual({ largura: 600, altura: 200 });
  });

  it("recusa o que não é PNG (JPEG, texto, arquivo curto)", () => {
    expect(lerDimensoesPng(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(30).fill(0)]))).toBeNull();
    expect(lerDimensoesPng(new TextEncoder().encode("<svg></svg> não é png de jeito nenhum"))).toBeNull();
    expect(lerDimensoesPng(cabecalhoPng(600, 200).slice(0, 20))).toBeNull();
  });

  it("recusa dimensão zero", () => {
    expect(lerDimensoesPng(cabecalhoPng(0, 200))).toBeNull();
  });
});
