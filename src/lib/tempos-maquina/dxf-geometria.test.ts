import { describe, expect, it } from "vitest";

import { calcularTempo } from "./calculo";
import { lerGeometriaDxf } from "./dxf-geometria";
import { PERFIS_REFERENCIA_PLANILHAS as REF } from "./referencia-planilhas";

/* DXF mínimo (cabeçalho com a unidade + ENTITIES), como o 3DX exporta. */
function dxf(entidades: string[], unidade: number | null = 4): string {
  const cabecalho = unidade === null ? [] : ["0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", String(unidade), "0", "ENDSEC"];
  return [...cabecalho, "0", "SECTION", "2", "ENTITIES", ...entidades.flatMap((e) => e.split("\n")), "0", "ENDSEC", "0", "EOF"].join("\r\n");
}

const linha = (x1: number, y1: number, x2: number, y2: number) =>
  `0\nLINE\n8\n0\n10\n${x1}\n20\n${y1}\n30\n0\n11\n${x2}\n21\n${y2}\n31\n0`;
const arco = (cx: number, cy: number, r: number, a0: number, a1: number, extrusaoZ = 1) =>
  `0\nARC\n8\n0\n10\n${cx}\n20\n${cy}\n30\n0\n40\n${r}\n50\n${a0}\n51\n${a1}\n230\n${extrusaoZ}`;
const circulo = (cx: number, cy: number, r: number, extrusaoZ = 1) =>
  `0\nCIRCLE\n8\n0\n10\n${cx}\n20\n${cy}\n30\n0\n40\n${r}\n230\n${extrusaoZ}`;
const retangulo = (x: number, y: number, l: number, a: number) => [
  linha(x, y, x + l, y),
  linha(x + l, y, x + l, y + a),
  linha(x + l, y + a, x, y + a),
  linha(x, y + a, x, y),
];

describe("lerGeometriaDxf", () => {
  it("retângulo com furo e oblongo: perímetro, área, furos e retângulo", () => {
    /* 200 x 100; furo Ø20; oblongo de 10 x 40 (retas de 30 + pontas R5), linhas fora de ordem e invertidas. */
    const r = lerGeometriaDxf(
      dxf([
        ...retangulo(0, 0, 200, 100).reverse(),
        circulo(50, 50, 10),
        linha(120, 45, 150, 45),
        arco(150, 50, 5, 270, 90),
        linha(150, 55, 120, 55),
        arco(120, 50, 5, 90, 270),
      ])
    );

    expect(r.ok).toBe(true);
    const g = r.geometria!;
    expect(g.perimetroExternoMm).toBeCloseTo(600, 6);
    expect(g.larguraMm).toBeCloseTo(100, 6);
    expect(g.comprimentoMm).toBeCloseTo(200, 6);
    expect(g.contornosInternos).toContainEqual({ tipo: "furo", diametroMm: 20 });
    expect(g.contornosInternos).toContainEqual({ tipo: "oblongo", larguraMm: 10, comprimentoMm: 40 });
    /* Área com os arcos em pontos de 1°: erro bem menor que 1 mm². */
    expect(g.areaMm2!).toBeCloseTo(20000 - Math.PI * 100 - (Math.PI * 25 + 300), 0);
    expect(r.avisos).toEqual([]);
  });

  it("polilinha fechada com bulge (meia-volta)", () => {
    const poli = [
      "0\nLWPOLYLINE\n8\n0\n90\n4\n70\n1",
      "10\n0\n20\n0\n42\n0",
      "10\n100\n20\n0\n42\n0",
      "10\n100\n20\n100\n42\n1",
      "10\n0\n20\n100\n42\n0",
    ].join("\n");
    const r = lerGeometriaDxf(dxf([poli]));

    expect(r.geometria!.perimetroExternoMm).toBeCloseTo(300 + 50 * Math.PI, 6);
    expect(r.geometria!.areaMm2!).toBeCloseTo(10000 + (Math.PI * 2500) / 2, 0);
  });

  it("furo feito de dois arcos vira furo", () => {
    const r = lerGeometriaDxf(dxf([...retangulo(0, 0, 100, 100), arco(50, 50, 10, 0, 180), arco(50, 50, 10, 180, 360)]));

    expect(r.geometria!.contornosInternos).toEqual([{ tipo: "furo", diametroMm: 20 }]);
  });

  it("linha que não fecha contorno fica fora do corte, com aviso", () => {
    const r = lerGeometriaDxf(dxf([...retangulo(0, 0, 100, 50), linha(10, 25, 90, 25)]));

    expect(r.geometria!.perimetroExternoMm).toBeCloseTo(300, 6);
    expect(r.resumo.linhasSoltas).toBe(1);
    expect(r.avisos.join(" ")).toContain("não fecha");
  });

  it("círculo com extrusão invertida é espelhado no X", () => {
    /* Centro (-50, 25) no sistema do objeto = (50, 25) no desenho: dentro da peça. */
    const r = lerGeometriaDxf(dxf([...retangulo(0, 0, 100, 50), circulo(-50, 25, 5, -1)]));

    expect(r.resumo.pecasExtras).toBe(0);
    expect(r.geometria!.contornosInternos).toEqual([{ tipo: "furo", diametroMm: 10 }]);
  });

  it("converte polegadas para mm", () => {
    const r = lerGeometriaDxf(dxf(retangulo(0, 0, 10, 5), 1));

    expect(r.geometria!.comprimentoMm).toBeCloseTo(254, 6);
    expect(r.geometria!.larguraMm).toBeCloseTo(127, 6);
    expect(r.avisos.join(" ")).toContain("convertido");
  });

  it("peça girada: o retângulo acompanha a peça", () => {
    const c = Math.SQRT1_2;
    const p = [
      [0, 0],
      [100 * c, 100 * c],
      [100 * c - 50 * c, 100 * c + 50 * c],
      [-50 * c, 50 * c],
    ];
    const r = lerGeometriaDxf(dxf(p.map(([x, y], i) => linha(x, y, p[(i + 1) % 4][0], p[(i + 1) % 4][1]))));

    expect(r.geometria!.comprimentoMm).toBeCloseTo(100, 6);
    expect(r.geometria!.larguraMm).toBeCloseTo(50, 6);
  });

  it("duas peças separadas: usa a maior e avisa", () => {
    const r = lerGeometriaDxf(dxf([...retangulo(0, 0, 100, 100), ...retangulo(200, 0, 10, 10)]));

    expect(r.resumo.pecasExtras).toBe(1);
    expect(r.geometria!.perimetroExternoMm).toBeCloseTo(400, 6);
    expect(r.avisos.join(" ")).toContain("2 peças");
  });

  it("sem contorno fechado: erro", () => {
    const r = lerGeometriaDxf(dxf([linha(0, 0, 10, 0)]));

    expect(r.ok).toBe(false);
    expect(r.erros[0]).toContain("Nenhum contorno fechado");
  });

  it("a geometria do DXF vai direto para o cálculo de tempo", () => {
    const r = lerGeometriaDxf(dxf([...retangulo(0, 0, 500, 300), circulo(100, 100, 10)]));
    const tempo = calcularTempo(REF.laserByspeed.perfil, { espessuraMm: 3, variante: "padrao", geometria: r.geometria! });

    expect(tempo.ok).toBe(true);
    expect(tempo.referencia).toContainEqual({ rotulo: "Entradas", valor: "2" });
  });
});
