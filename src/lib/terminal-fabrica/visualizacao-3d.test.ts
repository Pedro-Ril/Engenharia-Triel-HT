import { describe, expect, it } from "vitest";

import { aplicarVisualizacaoNaUrl, lerVisualizacao3D } from "./visualizacao-3d";

describe("visualização do 3D no Terminal de Fábrica", () => {
  it("acrescenta a escolha só na página do terminal, mantendo os outros parâmetros", () => {
    expect(aplicarVisualizacaoNaUrl("http://proserver.trielht.com.br/terminal-fabrica?fullscreen=1", "product-explorer")).toBe(
      "http://proserver.trielht.com.br/terminal-fabrica?fullscreen=1&visualizacao3d=product-explorer"
    );
    expect(aplicarVisualizacaoNaUrl("http://proserver/terminal-fabrica/", "3dplay")).toBe(
      "http://proserver/terminal-fabrica/?visualizacao3d=3dplay"
    );
  });

  it("outras páginas e URLs inválidas voltam como vieram", () => {
    const outra = "http://proserver.trielht.com.br/estoque-equipamentos-usados/painel?fullscreen=1";
    expect(aplicarVisualizacaoNaUrl(outra, "product-explorer")).toBe(outra);
    expect(aplicarVisualizacaoNaUrl("não é url", "product-explorer")).toBe("não é url");
  });

  it("parâmetro ausente ou estranho é 3D Play", () => {
    expect(lerVisualizacao3D(null)).toBe("3dplay");
    expect(lerVisualizacao3D("qualquer")).toBe("3dplay");
    expect(lerVisualizacao3D("product-explorer")).toBe("product-explorer");
  });
});
