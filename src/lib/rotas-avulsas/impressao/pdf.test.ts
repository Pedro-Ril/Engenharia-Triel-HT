import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";

import { conferirPdf } from "./pdf";

async function gerarPdf(paginas: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < paginas; i++) doc.addPage();
  return Buffer.from(await doc.save());
}

describe("conferirPdf", () => {
  it("aceita um PDF válido e conta as páginas", async () => {
    const resultado = await conferirPdf(await gerarPdf(3), 10);
    expect(resultado.paginas).toBe(3);
    expect(resultado.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("recusa o que não começa com %PDF-", async () => {
    await expect(conferirPdf(Buffer.from("MZ".padEnd(200, "x")), 10)).rejects.toThrow("não é um PDF");
  });

  it("recusa PDF sem %%EOF no fim", async () => {
    const pdf = await gerarPdf(1);
    const cortado = pdf.subarray(0, pdf.lastIndexOf("%%EOF"));
    await expect(conferirPdf(cortado, 10)).rejects.toThrow("incompleto");
  });

  it("recusa PDF corrompido", async () => {
    const lixo = Buffer.from("%PDF-1.7\n" + "lixo ".repeat(40) + "\n%%EOF\n");
    await expect(conferirPdf(lixo, 10)).rejects.toThrow("corrompido");
  });

  it("recusa acima do máximo de páginas", async () => {
    await expect(conferirPdf(await gerarPdf(4), 3)).rejects.toThrow("máximo permitido é 3");
  });
});
