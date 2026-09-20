import "server-only";

import { ValidationError } from "@/lib/auth/errors";

const ASSINATURA_PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/*
 * Lê largura/altura direto do chunk IHDR (sempre os primeiros 25 bytes de
 * um PNG válido: 8 de assinatura + 4 de tamanho do chunk + 4 do tipo
 * "IHDR" + 4 de largura + 4 de altura) -- evita depender de uma lib de
 * imagem (nenhuma no projeto, ver plano) só pra isso.
 */
export function lerDimensoesPng(conteudo: Buffer): { largura: number; altura: number } {
  if (conteudo.length < 24 || !conteudo.subarray(0, 8).equals(ASSINATURA_PNG)) {
    throw new ValidationError("O arquivo enviado não é um PNG válido.");
  }

  const tipoChunk = conteudo.toString("ascii", 12, 16);
  if (tipoChunk !== "IHDR") {
    throw new ValidationError("O arquivo enviado não é um PNG válido.");
  }

  return {
    largura: conteudo.readUInt32BE(16),
    altura: conteudo.readUInt32BE(20),
  };
}
