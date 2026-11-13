/*
 * Copia o worker do pdf.js (visualizador de desenho da Consulta 2D / 3D)
 * de node_modules para public/pdfjs, de onde o navegador o baixa.
 *
 * Por que não `new URL("pdfjs-dist/...worker.min.mjs", import.meta.url)`:
 * o pdfjs-dist está em serverExternalPackages (o carimbo de pedido de
 * compra usa no servidor), e essa referência dentro do componente fazia o
 * build avisar "Package pdfjs-dist can't be external".
 *
 * Salvo como .js (não .mjs): o proxy deixa arquivo .js passar sem sessão,
 * e a Consulta 2D / 3D é usada sem login nos terminais. Para o worker de
 * módulo, o que importa é o tipo do conteúdo, não a extensão.
 */
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const origem = join(raiz, "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.min.mjs");
const destino = join(raiz, "public", "pdfjs");

await mkdir(destino, { recursive: true });
await copyFile(origem, join(destino, "pdf.worker.min.js"));

console.log("worker do pdf.js copiado para public/pdfjs (pdf.worker.min.js)");
