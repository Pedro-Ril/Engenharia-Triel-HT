import { describe, expect, it } from "vitest";

import type { PaginaResumo } from "../types/blocoNotas.types";
import { achatarArvore, ancestrais, idsDaSubarvore, montarArvore, tituloOuPadrao } from "./arvore";

function pagina(id: string, paiId: string | null, ordem: number, titulo = id): PaginaResumo {
  return { id, paiId, titulo, favorita: false, ordem, atualizadoEm: "2026-11-13T10:00:00" };
}

const paginas = [
  pagina("b", null, 1),
  pagina("a", null, 0),
  pagina("a2", "a", 1),
  pagina("a1", "a", 0),
  pagina("a1x", "a1", 0),
  pagina("orfa", "sumiu", 0),
];

describe("montarArvore", () => {
  it("monta pai/filhos na ordem e põe órfã na raiz", () => {
    const arvore = montarArvore(paginas);
    expect(arvore.map((no) => no.id)).toEqual(["a", "orfa", "b"]);
    expect(arvore[0].filhos.map((no) => no.id)).toEqual(["a1", "a2"]);
    expect(arvore[0].filhos[0].filhos.map((no) => no.id)).toEqual(["a1x"]);
  });
});

describe("ancestrais", () => {
  it("caminho da raiz até o pai, sem a própria página", () => {
    expect(ancestrais(paginas, "a1x").map((p) => p.id)).toEqual(["a", "a1"]);
    expect(ancestrais(paginas, "a")).toEqual([]);
  });

  it("não entra em laço se os dados tiverem ciclo", () => {
    const ciclo = [pagina("x", "y", 0), pagina("y", "x", 0)];
    expect(ancestrais(ciclo, "x").length).toBeLessThanOrEqual(2);
  });
});

describe("idsDaSubarvore", () => {
  it("a página e todas as descendentes", () => {
    expect([...idsDaSubarvore(paginas, "a")].sort()).toEqual(["a", "a1", "a1x", "a2"]);
    expect([...idsDaSubarvore(paginas, "b")]).toEqual(["b"]);
  });
});

describe("achatarArvore", () => {
  it("lista em profundidade com o nível de cada uma", () => {
    const lista = achatarArvore(montarArvore(paginas)).map(({ no, profundidade }) => `${no.id}:${profundidade}`);
    expect(lista).toEqual(["a:0", "a1:1", "a1x:2", "a2:1", "orfa:0", "b:0"]);
  });
});

describe("tituloOuPadrao", () => {
  it("título vazio vira 'Sem título'", () => {
    expect(tituloOuPadrao("  ")).toBe("Sem título");
    expect(tituloOuPadrao("Reunião")).toBe("Reunião");
  });
});
