import { beforeEach, describe, expect, it } from "vitest";

import { consumirLimite, limparLimites, registrarFalhaToken, segundosDeBloqueioIp } from "./limite";

const LIMITES = { porSegundo: 1, rajada: 5, porMinuto: 60 };

describe("consumirLimite", () => {
  beforeEach(() => limparLimites());

  it("deixa passar a rajada e barra a seguinte", () => {
    const t = 1_000_000;
    for (let i = 0; i < 5; i++) expect(consumirLimite("a", LIMITES, t)).toEqual({ ok: true });
    expect(consumirLimite("a", LIMITES, t)).toEqual({ ok: false, aguardarSegundos: 1 });
  });

  it("repõe uma ficha por segundo", () => {
    const t = 1_000_000;
    for (let i = 0; i < 5; i++) consumirLimite("a", LIMITES, t);
    expect(consumirLimite("a", LIMITES, t + 999).ok).toBe(false);
    expect(consumirLimite("a", LIMITES, t + 1000).ok).toBe(true);
  });

  it("respeita o teto por minuto mesmo com fichas sobrando", () => {
    const limites = { porSegundo: 100, rajada: 100, porMinuto: 3 };
    const t = 1_000_000;
    for (let i = 0; i < 3; i++) expect(consumirLimite("b", limites, t + i).ok).toBe(true);
    const barrado = consumirLimite("b", limites, t + 10);
    expect(barrado).toEqual({ ok: false, aguardarSegundos: 60 });
    expect(consumirLimite("b", limites, t + 60_000).ok).toBe(true);
  });

  it("conta cada token separado", () => {
    const t = 1_000_000;
    for (let i = 0; i < 5; i++) consumirLimite("a", LIMITES, t);
    expect(consumirLimite("a", LIMITES, t).ok).toBe(false);
    expect(consumirLimite("c", LIMITES, t).ok).toBe(true);
  });
});

describe("bloqueio por IP", () => {
  beforeEach(() => limparLimites());

  it("bloqueia na 10ª falha em 5 minutos, por 15 minutos", () => {
    const t = 1_000_000;
    for (let i = 0; i < 9; i++) expect(registrarFalhaToken("10.0.0.1", t + i)).toBe(false);
    expect(segundosDeBloqueioIp("10.0.0.1", t + 9)).toBe(0);
    expect(registrarFalhaToken("10.0.0.1", t + 9)).toBe(true);
    expect(segundosDeBloqueioIp("10.0.0.1", t + 10)).toBe(900);
    expect(segundosDeBloqueioIp("10.0.0.2", t + 10)).toBe(0);
    expect(segundosDeBloqueioIp("10.0.0.1", t + 9 + 15 * 60_000)).toBe(0);
  });

  it("esquece falhas mais velhas que 5 minutos", () => {
    const t = 1_000_000;
    for (let i = 0; i < 9; i++) registrarFalhaToken("10.0.0.1", t);
    expect(registrarFalhaToken("10.0.0.1", t + 5 * 60_000)).toBe(false);
  });
});
