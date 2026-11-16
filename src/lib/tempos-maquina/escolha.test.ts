import { describe, expect, it } from "vitest";

import { geometriaManual } from "./calculo";
import { calcularTempoCadastrado, escolhaDaPlanilhaLaser, perfisUsadosPelaEscolha, type PerfilDisponivel } from "./escolha";
import { PERFIS_REFERENCIA_PLANILHAS as REF } from "./referencia-planilhas";
import { validarParametrosPerfil } from "./validacao";

/* Os 4 lasers da planilha, como estão cadastrados (ids fictícios). */
const perfis: PerfilDisponivel[] = [
  { id: "bystar", nome: REF.laserBystar.nome, parametros: REF.laserBystar.perfil },
  { id: "bysprint", nome: REF.laserBysprint.nome, parametros: REF.laserBysprint.perfil },
  { id: "byspeed", nome: REF.laserByspeed.nome, parametros: REF.laserByspeed.perfil },
  { id: "trumpf", nome: REF.laserTrumpf.nome, parametros: REF.laserTrumpf.perfil },
  { id: "plasma", nome: REF.plasmaOxipira.nome, parametros: REF.plasmaOxipira.perfil },
];
const { parametros: escolha, faltando } = escolhaDaPlanilhaLaser(perfis.map((p) => ({ id: p.id, nome: p.nome, metodo: p.parametros.metodo })));

/* 500 x 300 mm, 4 furos Ø20 (o exemplo da aba Laser). */
const peca = (espessuraMm: number, variante?: string) => ({
  espessuraMm,
  variante,
  geometria: geometriaManual({ larguraMm: 500, comprimentoMm: 300, furos: [{ quantidade: 4, diametroMm: 20 }] }),
});

describe("escolha da tabela pela espessura (célula N7 da aba Laser)", () => {
  it("monta a regra da planilha com os perfis cadastrados, sem faltar máquina", () => {
    expect(faltando).toEqual([]);
    expect(perfisUsadosPelaEscolha(escolha).sort()).toEqual(["byspeed", "bysprint", "bystar", "trumpf"]);
  });

  it("4,75 mm padrão vai para a TRUMPF e dá o tempo da planilha (0,610 min)", () => {
    const r = calcularTempoCadastrado(escolha, peca(4.75), perfis);
    expect(r.ok).toBe(true);
    expect(r.perfilUsado?.id).toBe("trumpf");
    expect(r.tempoMin).toBeCloseTo(0.61, 3);
    expect(r.referencia[0]).toEqual({ rotulo: "Tabela usada", valor: REF.laserTrumpf.nome });
  });

  it("5 mm usa a linha de 4,75 mm, com aviso, e calcula igual", () => {
    const r = calcularTempoCadastrado(escolha, peca(5), perfis);
    expect(r.perfilUsado?.id).toBe("trumpf");
    expect(r.tempoMin).toBeCloseTo(calcularTempoCadastrado(escolha, peca(4.75), perfis).tempoMin as number, 9);
    expect(r.avisos.join(" ")).toContain("4,75 mm");
  });

  it("segue a regra em cada espessura e variante", () => {
    const usado = (espessura: number, variante?: string) => calcularTempoCadastrado(escolha, peca(espessura, variante), perfis).perfilUsado?.id;
    expect(usado(3)).toBe("bysprint");
    expect(usado(3.35)).toBe("byspeed");
    expect(usado(4.25)).toBe("bystar");
    expect(usado(6.35)).toBe("trumpf");
    expect(usado(12.7)).toBe("byspeed");
    expect(usado(3, "especial")).toBe("byspeed");
    expect(usado(9.5, "especial")).toBe("trumpf");
    expect(usado(11, "especial")).toBe("byspeed");
  });

  it("a variante vai junto para a tabela escolhida", () => {
    const r = calcularTempoCadastrado(escolha, peca(4.75, "especial"), perfis);
    expect(r.perfilUsado?.id).toBe("byspeed");
    expect(r.referencia.find((x) => x.rotulo === "Variante")?.valor).toBe("Material especial");
  });

  it("combinação sem máquina na planilha não calcula", () => {
    const padrao11 = calcularTempoCadastrado(escolha, peca(11), perfis);
    expect(padrao11.ok).toBe(false);
    expect(padrao11.erros[0]).toContain("11 mm");
    expect(calcularTempoCadastrado(escolha, peca(1.5, "especial"), perfis).ok).toBe(false);
    expect(calcularTempoCadastrado(escolha, peca(25), perfis).erros[0]).toContain("fora da tabela");
  });

  it("perfil apagado ou que não é de corte CNC vira erro, não exceção", () => {
    const semTrumpf = perfis.filter((p) => p.id !== "trumpf");
    expect(calcularTempoCadastrado(escolha, peca(4.75), semTrumpf).erros[0]).toContain("não existe mais");
  });

  it("perfil comum continua calculando como antes", () => {
    const r = calcularTempoCadastrado(REF.laserBysprint.perfil, peca(4.75), perfis);
    expect(r.perfilUsado).toBeNull();
    expect(r.tempoMin).toBeCloseTo(0.8239, 4);
  });

  it("a validação aceita a escolha e devolve a mesma coisa", () => {
    expect(validarParametrosPerfil("escolha_espessura", structuredClone(escolha))).toEqual(escolha);
  });
});
