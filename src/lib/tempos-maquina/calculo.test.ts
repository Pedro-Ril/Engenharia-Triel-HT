import { describe, expect, it } from "vitest";

import { calcularTempo, geometriaManual, perimetroContorno } from "./calculo";
import { PERFIS_REFERENCIA_PLANILHAS as REF } from "./referencia-planilhas";
import type { PerfilTabelaDimensao } from "./tipos";

const parcela = (resultado: ReturnType<typeof calcularTempo>, chave: string) =>
  resultado.parcelas.find((p) => p.chave === chave)?.minutos;

describe("corte CNC: laser (planilha TEMPOS PLASMA CNC, aba Laser)", () => {
  /*
   * BYSPEED, material padrão, 4,75 mm, 500 x 300 mm, 4 furos Ø20 e 1
   * oblongo 20 x 60. Esperado calculado pelas células da planilha
   * (L70..L77), com π de verdade nos furos -- com o 3,1415 da planilha
   * dá 0,79679245 (0,0001 s a menos).
   */
  const dados = {
    espessuraMm: 4.75,
    variante: "padrao",
    geometria: geometriaManual({
      larguraMm: 500,
      comprimentoMm: 300,
      furos: [{ quantidade: 4, diametroMm: 20 }],
      oblongos: [{ quantidade: 1, larguraMm: 20, comprimentoMm: 60 }],
    }),
  };

  it("reproduz o tempo da planilha, parcela por parcela", () => {
    const r = calcularTempo(REF.laserByspeed.perfil, dados);

    expect(r.ok).toBe(true);
    expect(r.tempoMin).toBeCloseTo(0.796794770424681, 10);
    expect(parcela(r, "corte")).toBeCloseTo(1994.159265 / 3200, 6); // L70
    expect(parcela(r, "perfuracao")).toBeCloseTo(0.08, 10); // L71 = 6 x (0,4 + 0,4)/60
    expect(parcela(r, "vazio")).toBeCloseTo(300 / 120000, 10); // L72
    expect(parcela(r, "entrada_saida")).toBeCloseTo((6 * 5) / 3200, 10); // L73
    expect(parcela(r, "trocar_mesa")).toBeCloseTo(0.025 * 1.431, 10); // L74
    expect(parcela(r, "referenciar_chapa")).toBeCloseTo(0.025 * 0.343, 10); // L75
    expect(parcela(r, "limpeza_bico")).toBeCloseTo((6 / 50) * 0.276, 10); // L76
    expect(parcela(r, "finalizar_programa")).toBeCloseTo(0.025 * 0.171, 10); // L77
    expect(r.referencia).toContainEqual({ rotulo: "Entradas", valor: "6" });
  });

  it("sem furo nem entrada: uma entrada só e nada de movimento no vazio", () => {
    const r = calcularTempo(REF.laserByspeed.perfil, {
      espessuraMm: 3,
      variante: "padrao",
      geometria: geometriaManual({ larguraMm: 200, comprimentoMm: 100 }),
    });

    expect(r.ok).toBe(true);
    expect(parcela(r, "vazio")).toBe(0);
    expect(r.referencia).toContainEqual({ rotulo: "Entradas", valor: "1" });
  });

  it("espessura fora da tabela da máquina não calcula", () => {
    const r = calcularTempo(REF.laserByspeed.perfil, { ...dados, espessuraMm: 16 });

    expect(r.ok).toBe(false);
    expect(r.erros[0]).toContain("fora da tabela");
  });

  it("espessura que não está na tabela usa a mais próxima, com aviso", () => {
    const r = calcularTempo(REF.laserByspeed.perfil, { ...dados, espessuraMm: 4.8 });

    expect(r.ok).toBe(true);
    expect(r.avisos.join(" ")).toContain("4,75 mm");
  });

  it("só o perímetro (sem medidas): calcula o corte e avisa que os tempos por chapa ficaram fora", () => {
    const r = calcularTempo(REF.laserByspeed.perfil, {
      espessuraMm: 3,
      variante: "padrao",
      geometria: geometriaManual({ perimetroMm: 1200, entradas: 2 }),
    });

    expect(r.ok).toBe(true);
    expect(parcela(r, "trocar_mesa")).toBe(0);
    expect(parcela(r, "vazio")).toBeCloseTo(1200 / 4 / 120000, 10);
    expect(r.avisos.join(" ")).toContain("Sem a área");
  });

  it("sem medidas nem perímetro: erro em vez de tempo zero", () => {
    const r = calcularTempo(REF.laserByspeed.perfil, { espessuraMm: 3, geometria: geometriaManual({}) });

    expect(r.ok).toBe(false);
    expect(r.tempoMin).toBeNull();
  });
});

describe("corte CNC: plasma (aba Plasma OXIPIRA)", () => {
  /* 80 A, 9,5 mm, 400 x 250 mm, 2 furos Ø30 (células T46..T52). */
  it("reproduz o tempo da planilha", () => {
    const r = calcularTempo(REF.plasmaOxipira.perfil, {
      espessuraMm: 9.5,
      variante: "80A",
      geometria: geometriaManual({ larguraMm: 400, comprimentoMm: 250, furos: [{ quantidade: 2, diametroMm: 30 }] }),
    });

    expect(r.ok).toBe(true);
    expect(r.tempoMin).toBeCloseTo(1.155956800671485, 10);
    expect(parcela(r, "perfuracao")).toBeCloseTo(3 * (0.086 + 0.5 / 60), 10); // T47
    expect(parcela(r, "vazio")).toBeCloseTo(250 / 16000, 10); // T49
    expect(parcela(r, "entrada_saida")).toBeCloseTo((3 * 4.5) / 1810, 10); // T50
    expect(parcela(r, "referenciar_chapa")).toBeCloseTo((100000 / 9000000) * 2.475, 10); // T52
  });

  it("sem variante: passa para 260 A quando 80 A não corta a espessura", () => {
    const r = calcularTempo(REF.plasmaOxipira.perfil, {
      espessuraMm: 25,
      geometria: geometriaManual({ larguraMm: 300, comprimentoMm: 300 }),
    });

    expect(r.ok).toBe(true);
    expect(r.referencia).toContainEqual({ rotulo: "Variante", valor: "260 A" });
    expect(r.avisos.join(" ")).toContain("260 A");
  });

  it("260 A recusa furo menor que espessura / 2,5 (regra da planilha)", () => {
    const r = calcularTempo(REF.plasmaOxipira.perfil, {
      espessuraMm: 9.5,
      variante: "260A",
      geometria: geometriaManual({ larguraMm: 300, comprimentoMm: 300, furos: [{ quantidade: 1, diametroMm: 3 }] }),
    });

    expect(r.ok).toBe(false);
    expect(r.erros[0]).toContain("pequeno demais");
  });

  it("oblongo com o perímetro corrigido (a planilha do plasma somava 2·c − w)", () => {
    expect(perimetroContorno({ tipo: "oblongo", larguraMm: 20, comprimentoMm: 60 })).toBeCloseTo(Math.PI * 20 + 80, 10);
    expect(perimetroContorno({ tipo: "oblongo", larguraMm: 20, comprimentoMm: 60, retangular: true })).toBe(160);
  });
});

describe("tabela por dimensão (TEMPOS CORTE E DOBRA)", () => {
  /* Valores calculados pela própria planilha: 500 x 700, 0,91 a 2,65 mm, mais de três dobras. */
  const geometria = geometriaManual({ larguraMm: 500, comprimentoMm: 700 });

  it("guilhotina: o tempo da tabela (planilha: 0,3486)", () => {
    const r = calcularTempo(REF.guilhotina.perfil, { espessuraMm: 2, geometria });

    expect(r.ok).toBe(true);
    expect(r.tempoMin).toBeCloseTo(0.3486, 10);
  });

  it("dobradeira: tempo base x fator do perfil (planilha: 0,5926)", () => {
    const r = calcularTempo(REF.dobradeira.perfil, { espessuraMm: 2, geometria, dobra: { fator: "mais_de_tres" } });

    expect(r.ok).toBe(true);
    expect(r.tempoMin).toBeCloseTo(0.3486 * 1.7, 10);
  });

  it("a ordem das medidas não importa e a medida sobe para o próximo degrau", () => {
    const invertida = calcularTempo(REF.guilhotina.perfil, { espessuraMm: 2, geometria: geometriaManual({ larguraMm: 700, comprimentoMm: 500 }) });
    const entreDegraus = calcularTempo(REF.guilhotina.perfil, { espessuraMm: 2, geometria: geometriaManual({ larguraMm: 450, comprimentoMm: 650 }) });

    expect(invertida.tempoMin).toBeCloseTo(0.3486, 10);
    expect(entreDegraus.tempoMin).toBeCloseTo(0.3486, 10);
  });

  it("acima da tabela usa o maior valor, com aviso", () => {
    const r = calcularTempo(REF.guilhotina.perfil, { espessuraMm: 2, geometria: geometriaManual({ larguraMm: 2000, comprimentoMm: 4000 }) });

    expect(r.ok).toBe(true);
    expect(r.tempoMin).toBeCloseTo(40 * 0.0498, 10);
    expect(r.avisos[0]).toContain("acima da tabela");
  });

  it("espessura entre faixas vai para a faixa seguinte; acima da última, erro", () => {
    const entreFaixas = calcularTempo(REF.guilhotina.perfil, { espessuraMm: 2.8, geometria });
    const acima = calcularTempo(REF.guilhotina.perfil, { espessuraMm: 30, geometria });

    expect(entreFaixas.referencia).toContainEqual({ rotulo: "Faixa de espessura", valor: "3,0 à 4,75 mm" });
    expect(acima.ok).toBe(false);
  });

  it("dobradeira sem o tipo de dobra não calcula", () => {
    const r = calcularTempo(REF.dobradeira.perfil, { espessuraMm: 2, geometria });

    expect(r.ok).toBe(false);
    expect(r.erros[0]).toContain("tipo de dobra");
  });

  it("regra do app do PCP: 10% a mais por dobra", () => {
    const porDobra: PerfilTabelaDimensao = { ...REF.dobradeira.perfil, dobra: { regra: "por_dobra", acrescimoPorDobra: 0.1 } };
    const r = calcularTempo(porDobra, { espessuraMm: 2, geometria, dobra: { quantidade: 4 } });

    expect(r.tempoMin).toBeCloseTo(0.3486 * 1.4, 10);
  });
});
