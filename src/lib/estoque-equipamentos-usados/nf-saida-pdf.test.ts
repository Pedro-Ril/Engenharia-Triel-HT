import { describe, expect, it } from "vitest";

import { escolherArquivoNf, pastaEhDoMes } from "./nf-saida-pdf";

/* Nomes reais da pasta \\SERVIDORGERAL\Triel\Financeiro\publico\NFE\Matriz\2025\Fevereiro 2025. */
const FEVEREIRO = [
  "Boletos NF 69493.PDF",
  "Manifesto NF 69491.pdf",
  "Manifesto NF 69501.pdf",
  "CCe NF 69501.PDF",
  "NF 69490 - EREPREST - 895.PDF",
  "NF 69491 - EREPREST - 897.PDF",
  "NF 69501 - EREPREST - 889.PDF",
  "NF 695010 - OUTRA.PDF",
  "NF 69494 - BOMBEIROS RS - ENTRADA SILO 923.PDF",
];

describe("escolherArquivoNf", () => {
  it("acha a NF e ignora manifesto, boleto e CCe", () => {
    expect(escolherArquivoNf(FEVEREIRO, "69501", 889)).toBe("NF 69501 - EREPREST - 889.PDF");
    expect(escolherArquivoNf(FEVEREIRO, "69491", null)).toBe("NF 69491 - EREPREST - 897.PDF");
  });

  it("não confunde com número maior que começa igual", () => {
    expect(escolherArquivoNf(["NF 695010 - OUTRA.PDF"], "69501", null)).toBeNull();
  });

  it("aceita zeros à esquerda e série no número", () => {
    expect(escolherArquivoNf(FEVEREIRO, "069501/55", 889)).toBe("NF 69501 - EREPREST - 889.PDF");
  });

  it("com mais de um arquivo da mesma NF, prefere o do equipamento", () => {
    const nomes = ["NF 72580 - EREPREST - 902.PDF", "NF 72580 - EREPREST - 906.PDF"];
    expect(escolherArquivoNf(nomes, "72580", 906)).toBe("NF 72580 - EREPREST - 906.PDF");
  });

  it("não acha quando não existe", () => {
    expect(escolherArquivoNf(FEVEREIRO, "70000", null)).toBeNull();
    expect(escolherArquivoNf(FEVEREIRO, "", null)).toBeNull();
  });
});

describe("pastaEhDoMes", () => {
  it("reconhece os dois jeitos de nomear a pasta do mês", () => {
    expect(pastaEhDoMes("Fevereiro 2025", 2)).toBe(true);
    expect(pastaEhDoMes("Março 2025", 3)).toBe(true);
    expect(pastaEhDoMes("5 - Maio", 5)).toBe(true);
    expect(pastaEhDoMes("05 - Maio", 5)).toBe(true);
    expect(pastaEhDoMes("10 - Outubro", 10)).toBe(true);
  });

  it("não confunde meses", () => {
    expect(pastaEhDoMes("10 - Outubro", 1)).toBe(false);
    expect(pastaEhDoMes("Fevereiro 2025", 3)).toBe(false);
    expect(pastaEhDoMes("NOTAS DE DEBITO 2025", 2)).toBe(false);
  });
});
