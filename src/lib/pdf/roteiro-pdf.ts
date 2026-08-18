import "server-only";

import fs from "fs/promises";
import path from "path";
import { PDFDocument } from "pdf-lib";

/*
 * Compartilhado entre a rota de PDF do cadastro-roteiro (com
 * login) e a do terminal de fábrica (pública/kiosk) — mesma
 * pasta de desenhos, mesma regra de nomes de arquivo
 * ("CODIGO.pdf", "CODIGO_1.pdf", "CODIGO_2.pdf", ...), mesma
 * junção de todas as folhas num único PDF.
 */
const PDF_DIR =
  process.env.PDF_DESENHOS_DIR ||
  "\\\\servidorgeral\\Derivados\\Triel-HT\\DESENHOS";

export function limparCodigoPdf(codigo: string): string {
  return String(codigo || "")
    .trim()
    .replace(/[^0-9A-Za-z_-]/g, "");
}

function escaparRegex(valor: string) {
  return String(valor || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function obterSequencia(nomeArquivo: string, codigo: string) {
  const nome = String(nomeArquivo || "").toLowerCase();
  const codigoLower = String(codigo || "").toLowerCase();

  if (nome === `${codigoLower}.pdf`) return 0;

  const regex = new RegExp(`^${escaparRegex(codigoLower)}_(\\d+)\\.pdf$`, "i");

  const match = nome.match(regex);

  return match ? Number(match[1]) : 999999;
}

export async function localizarPdfsDoItem(codigo: string): Promise<string[]> {
  const arquivos = await fs.readdir(PDF_DIR);

  const codigoRegex = escaparRegex(codigo);
  const regex = new RegExp(`^${codigoRegex}(?:_\\d+)?\\.pdf$`, "i");

  return arquivos
    .filter((arquivo) => regex.test(arquivo))
    .sort((a, b) => obterSequencia(a, codigo) - obterSequencia(b, codigo))
    .map((arquivo) => path.join(PDF_DIR, arquivo));
}

export async function montarPdfUnico(arquivosPdf: string[]): Promise<Uint8Array> {
  const pdfFinal = await PDFDocument.create();

  for (const arquivo of arquivosPdf) {
    const bytes = await fs.readFile(arquivo);

    const pdfOrigem = await PDFDocument.load(bytes, {
      ignoreEncryption: true,
    });

    const paginas = await pdfFinal.copyPages(
      pdfOrigem,
      pdfOrigem.getPageIndices()
    );

    paginas.forEach((pagina) => pdfFinal.addPage(pagina));
  }

  return pdfFinal.save();
}
