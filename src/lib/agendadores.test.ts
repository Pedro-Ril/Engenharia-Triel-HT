import { describe, expect, it } from "vitest";

import { agendadoresLigados } from "./agendadores";

describe("agendadoresLigados", () => {
  it("produção liga, desenvolvimento não", () => {
    expect(agendadoresLigados({ NODE_ENV: "production" })).toBe(true);
    expect(agendadoresLigados({ NODE_ENV: "development" })).toBe(false);
    expect(agendadoresLigados({})).toBe(false);
  });
  it("AGENDADORES_ATIVOS manda sobre o NODE_ENV", () => {
    expect(agendadoresLigados({ NODE_ENV: "development", AGENDADORES_ATIVOS: "1" })).toBe(true);
    expect(agendadoresLigados({ NODE_ENV: "production", AGENDADORES_ATIVOS: "0" })).toBe(false);
  });
});
