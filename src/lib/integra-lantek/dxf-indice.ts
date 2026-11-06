import "server-only";

import fs from "fs/promises";
import path from "path";

/*
 * Índice dos DXFs da pasta configurada (recursivo, chave = nome do arquivo
 * sem extensão, minúsculo) e a regra que escolhe o DXF de uma peça. Usado
 * pela validação (validar-dxf) e pelo registro das exportações -- a mesma
 * regra nos dois, para o log mostrar o que a validação escolheria.
 */

export type ArquivoDxf = {
  caminho: string;
  arquivo: string;
};

export async function listarDxfRecursivo(pastaBase: string): Promise<Map<string, ArquivoDxf[]>> {
  const indice = new Map<string, ArquivoDxf[]>();

  async function percorrer(pasta: string) {
    let entradas;

    try {
      entradas = await fs.readdir(pasta, { withFileTypes: true });
    } catch {
      return;
    }

    const subPastas: string[] = [];

    for (const entrada of entradas) {
      const caminhoCompleto = path.join(pasta, entrada.name);

      if (entrada.isDirectory()) {
        subPastas.push(caminhoCompleto);
        continue;
      }

      if (!entrada.isFile()) continue;
      if (path.extname(entrada.name).toLowerCase() !== ".dxf") continue;

      const chave = path.basename(entrada.name, path.extname(entrada.name)).trim().toLowerCase();

      const encontrado: ArquivoDxf = {
        caminho: caminhoCompleto,
        arquivo: entrada.name,
      };

      const lista = indice.get(chave);
      if (lista) {
        lista.push(encontrado);
      } else {
        indice.set(chave, [encontrado]);
      }
    }

    await Promise.all(subPastas.map((sub) => percorrer(sub)));
  }

  await percorrer(pastaBase);

  /*
   * Nome repetido em pastas diferentes: a varredura é em paralelo, então a
   * ordem em que os arquivos chegam muda de uma vez para outra -- e a busca
   * pegava "o primeiro". Agora fica sempre o mais recente primeiro (empate:
   * pelo caminho), para a escolha ser a mesma em toda busca. Só os nomes
   * repetidos são consultados (são poucos).
   */
  await Promise.all(
    [...indice.values()]
      .filter((lista) => lista.length > 1)
      .map(async (lista) => {
        const datas = new Map<string, number>();
        await Promise.all(
          lista.map(async (arquivo) => {
            try {
              datas.set(arquivo.caminho, (await fs.stat(arquivo.caminho)).mtimeMs);
            } catch {
              datas.set(arquivo.caminho, 0);
            }
          })
        );
        lista.sort(
          (a, b) => (datas.get(b.caminho) ?? 0) - (datas.get(a.caminho) ?? 0) || a.caminho.localeCompare(b.caminho)
        );
      })
  );

  return indice;
}

export function buscarNoIndice(indice: Map<string, ArquivoDxf[]>, codigo: string): ArquivoDxf[] {
  const chave = codigo.trim().toLowerCase();
  if (!chave) return [];
  return indice.get(chave) ?? [];
}

/*
 * Regra da validação: primeiro um DXF com o nome do código do item; se não
 * houver, com o nome do código do desenho. Com mais de um arquivo de mesmo
 * nome, fica o mais recente (ver listarDxfRecursivo).
 */
export function escolherDxf(indice: Map<string, ArquivoDxf[]>, codigo: string, codDesenho: string) {
  let encontrados = codigo ? buscarNoIndice(indice, codigo) : [];
  let codigoUsado = "";
  let origem: "codigo" | "cod_desenho" | "" = "";

  if (encontrados.length > 0) {
    codigoUsado = codigo;
    origem = "codigo";
  } else if (codDesenho) {
    encontrados = buscarNoIndice(indice, codDesenho);

    if (encontrados.length > 0) {
      codigoUsado = codDesenho;
      origem = "cod_desenho";
    }
  }

  return { encontrados, codigoUsado, origem, principal: encontrados[0] as ArquivoDxf | undefined };
}
