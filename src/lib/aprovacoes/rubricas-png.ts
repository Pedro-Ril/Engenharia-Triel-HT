/*
 * Leitura do cabeçalho de um PNG -- puro, sem banco, testado em
 * rubricas-png.test.ts. A assinatura de 8 bytes e o bloco IHDR (largura
 * e altura em big-endian) bastam para recusar o que não é PNG sem
 * decodificar a imagem.
 */

const ASSINATURA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function lerDimensoesPng(conteudo: Uint8Array): { largura: number; altura: number } | null {
  if (conteudo.length < 24) return null;
  if (!ASSINATURA_PNG.every((byte, i) => conteudo[i] === byte)) return null;

  /* O primeiro bloco é sempre o IHDR. */
  const tipo = String.fromCharCode(conteudo[12], conteudo[13], conteudo[14], conteudo[15]);
  if (tipo !== "IHDR") return null;

  const leitor = new DataView(conteudo.buffer, conteudo.byteOffset, conteudo.byteLength);
  const largura = leitor.getUint32(16);
  const altura = leitor.getUint32(20);
  return largura > 0 && altura > 0 ? { largura, altura } : null;
}
