import { describe, expect, it } from "vitest";

import { cabecalhoUsuarioErp } from "./usuario-erp";

describe("cabecalhoUsuarioErp", () => {
  it("manda o login do AD no formato que a API aceita", () => {
    expect(cabecalhoUsuarioErp("pedro.ril")).toEqual({ "X-Usuario-Portal": "pedro.ril" });
    expect(cabecalhoUsuarioErp(" joao.vmoraes ")).toEqual({ "X-Usuario-Portal": "joao.vmoraes" });
  });

  it("login vazio ou fora do formato: sem header (o ERP grava 'API', em vez de recusar a gravação)", () => {
    expect(cabecalhoUsuarioErp("")).toEqual({});
    expect(cabecalhoUsuarioErp(null)).toEqual({});
    expect(cabecalhoUsuarioErp("pedro ril")).toEqual({});
    expect(cabecalhoUsuarioErp("a".repeat(61))).toEqual({});
  });
});
