import "server-only";

import { createHash } from "node:crypto";

import { EncryptedPDFError, PDFDocument } from "pdf-lib";

import { ValidationError } from "@/lib/auth/errors";

/*
 * Confere que o arquivo é um PDF de verdade antes de mandar para a
 * impressora: assinatura "%PDF-" no começo, "%%EOF" no fim, abre no
 * pdf-lib (que também conta as páginas) e não pode estar protegido por
 * senha (a impressora não teria como abrir).
 */
export async function conferirPdf(dados: Buffer, paginasMax: number): Promise<{ paginas: number; sha256: string }> {
  if (dados.length < 64 || dados.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw new ValidationError("O arquivo enviado não é um PDF.");
  }
  if (!dados.subarray(-2048).toString("latin1").includes("%%EOF")) {
    throw new ValidationError("O PDF está incompleto (sem o marcador de fim de arquivo).");
  }

  let paginas: number;
  try {
    const documento = await PDFDocument.load(dados, { updateMetadata: false });
    paginas = documento.getPageCount();
  } catch (erro) {
    if (erro instanceof EncryptedPDFError) {
      throw new ValidationError("PDF protegido por senha não pode ser impresso.");
    }
    throw new ValidationError("O PDF está corrompido ou não pôde ser lido.");
  }

  if (paginas < 1) throw new ValidationError("O PDF não tem nenhuma página.");
  if (paginas > paginasMax) {
    throw new ValidationError(`O PDF tem ${paginas} páginas; o máximo permitido é ${paginasMax}.`);
  }

  return { paginas, sha256: createHash("sha256").update(dados).digest("hex") };
}
