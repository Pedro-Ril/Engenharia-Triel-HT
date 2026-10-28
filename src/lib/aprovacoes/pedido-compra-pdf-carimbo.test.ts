import { writeFileSync } from "node:fs";

import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { carimbarAprovacoes, type AprovacaoCarimbo } from "./pedido-compra-pdf-carimbo";
import {
  formatarDataHoraCarimbo,
  MAXIMO_BLOCOS_NO_RODAPE,
  planejarBlocos,
  textoParaWinAnsi,
} from "./pedido-compra-pdf-carimbo-layout";

/* PNG 1×1 transparente: basta para o pdf-lib embutir. */
const PNG = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="),
  (c) => c.charCodeAt(0)
);

/* Pedido de mentira com o rodapé do Suprimentos ("Ass:" na última página com conteúdo). */
async function pdfDePedido(comAssinatura: boolean): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const fonte = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage([595, 822]).drawText("Pedido de compra", { x: 40, y: 760, size: 12, font: fonte });
  const ultima = pdf.addPage([595, 822]);
  ultima.drawText("Comprador: TESTE", { x: 5, y: 97, size: 9, font: fonte });
  if (comAssinatura) ultima.drawText("Ass: ______________________", { x: 7, y: 63, size: 9, font: fonte });
  return pdf.save();
}

const aprovacao = (nivelOrdem: number, rubrica: Uint8Array | null = PNG): AprovacaoCarimbo => ({
  nivelOrdem,
  nivelNome: nivelOrdem === 1 ? "Gerência" : "Diretoria",
  nome: `Aprovador ${nivelOrdem}`,
  decididoEm: "2026-10-27T14:32:10.123",
  rubrica,
});

describe("layout do carimbo", () => {
  it("até três blocos lado a lado, sem passar da faixa", () => {
    for (let n = 1; n <= MAXIMO_BLOCOS_NO_RODAPE; n += 1) {
      const blocos = planejarBlocos(n, { xInicio: 297.5, xFim: 585 })!;
      expect(blocos).toHaveLength(n);
      const ultimo = blocos[n - 1];
      expect(ultimo.x + ultimo.largura).toBeLessThanOrEqual(585);
    }
    expect(planejarBlocos(4, { xInicio: 297.5, xFim: 585 })).toBeNull();
    expect(planejarBlocos(0, { xInicio: 297.5, xFim: 585 })).toBeNull();
  });

  it("data no formato brasileiro, sem fuso", () => {
    expect(formatarDataHoraCarimbo("2026-10-27T14:32:10.123")).toBe("27/10/2026 14:32");
    expect(formatarDataHoraCarimbo("2026-10-27")).toBe("27/10/2026");
  });

  it("acentos passam; o que a fonte do PDF não escreve vira ?", () => {
    expect(textoParaWinAnsi("Nível 2 · Gerência — João")).toBe("Nível 2 · Gerência — João");
    expect(textoParaWinAnsi("Ok ✅")).toBe("Ok ?");
  });
});

describe("carimbarAprovacoes", () => {
  it("com o 'Ass:' no rodapé, carimba ali e não cria página", async () => {
    const saida = await carimbarAprovacoes(await pdfDePedido(true), [aprovacao(1), aprovacao(2)], "aprovação #16");
    expect((await PDFDocument.load(saida)).getPageCount()).toBe(2);
    /* Para conferir a olho: SALVAR_PDF_CARIMBO=caminho npx vitest run ... */
    if (process.env.SALVAR_PDF_CARIMBO) writeFileSync(process.env.SALVAR_PDF_CARIMBO, saida);
  });

  it("sem o 'Ass:', as aprovações vão numa página própria no fim", async () => {
    const saida = await carimbarAprovacoes(await pdfDePedido(false), [aprovacao(1)], "aprovação #16");
    expect((await PDFDocument.load(saida)).getPageCount()).toBe(3);
  });

  it("mais níveis do que cabem no rodapé também vão para a página própria", async () => {
    const quatro = [1, 2, 3, 4].map((n) => aprovacao(n));
    const saida = await carimbarAprovacoes(await pdfDePedido(true), quatro, "aprovação #16");
    expect((await PDFDocument.load(saida)).getPageCount()).toBe(3);
  });

  it("sem rubrica (ou PNG estragado) ainda carimba nome, nível e data", async () => {
    const estragado = new Uint8Array([1, 2, 3]);
    const saida = await carimbarAprovacoes(await pdfDePedido(true), [aprovacao(1, null), aprovacao(2, estragado)], "x");
    expect((await PDFDocument.load(saida)).getPageCount()).toBe(2);
  });

  it("sem aprovação nenhuma, devolve o PDF como veio", async () => {
    const original = await pdfDePedido(true);
    expect(await carimbarAprovacoes(original, [], "x")).toBe(original);
  });
});
