/*
 * Copia o leitor de STEP/IGES (occt-import-js) de node_modules para
 * public/occt, de onde o navegador o baixa sob demanda.
 *
 * Por que copiar em vez de versionar: o .wasm tem ~7,6 MB. Guardá-lo no
 * git engordaria o repositório para sempre, e a cada atualização do
 * pacote entraria outra cópia inteira no histórico. Como ele já vem no
 * node_modules, basta colocá-lo onde o Next serve arquivos estáticos
 * antes de rodar ou de compilar (ver os scripts predev/prebuild).
 *
 * Não pode ser um import comum: é código gerado pelo Emscripten, que o
 * bundler tentaria resolver como módulo de Node.
 */
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const origem = join(raiz, "node_modules", "occt-import-js", "dist");
const destino = join(raiz, "public", "occt");

const ARQUIVOS = ["occt-import-js.js", "occt-import-js.wasm"];

await mkdir(destino, { recursive: true });

for (const arquivo of ARQUIVOS) {
  await copyFile(join(origem, arquivo), join(destino, arquivo));
}

console.log(`occt-import-js copiado para public/occt (${ARQUIVOS.join(", ")})`);
