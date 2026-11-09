import { describe, expect, it } from "vitest";

import { estaForaDaListaDeMateriais, removerForaDaListaDeMateriais } from "./lista-materiais";

type No = { physicalId: string; instancia?: { kind?: string | null } | null; children?: No[] };

const no = (physicalId: string, kind: string | null, children: No[] = []): No => ({
  physicalId,
  instancia: kind === null ? null : { kind },
  children,
});

describe("estaForaDaListaDeMateriais", () => {
  it("reconhece a ligação sozinha ou junto com outro tipo", () => {
    expect(estaForaDaListaDeMateriais(no("a", "SynchroEBOMExt"))).toBe(true);
    expect(estaForaDaListaDeMateriais(no("a", "SynchroEBOMExt,XCADGenericInstExtension"))).toBe(true);
    expect(estaForaDaListaDeMateriais(no("a", "XCADGenericInstExtension, SynchroEBOMExt"))).toBe(true);
  });

  it("mantém as outras ligações e o nó sem ligação", () => {
    expect(estaForaDaListaDeMateriais(no("a", "XCADGenericInstExtension"))).toBe(false);
    expect(estaForaDaListaDeMateriais(no("a", null))).toBe(false);
  });
});

describe("removerForaDaListaDeMateriais", () => {
  it("tira o filho fora da lista junto com o que está abaixo dele", () => {
    const raiz = no("raiz", null, [
      no("fica", "XCADGenericInstExtension", [no("neto", "XCADGenericInstExtension")]),
      no("sai", "SynchroEBOMExt,XCADGenericInstExtension", [no("neto-sai", "SynchroEBOMExt,XCADGenericInstExtension")]),
    ]);

    const resultado = removerForaDaListaDeMateriais(raiz);

    expect(resultado.children?.map((filho) => filho.physicalId)).toEqual(["fica"]);
    expect(resultado.children?.[0].children?.map((filho) => filho.physicalId)).toEqual(["neto"]);
  });
});
