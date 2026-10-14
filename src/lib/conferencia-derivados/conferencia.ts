import "server-only";

import fs from "fs/promises";
import path from "path";

import {
  definicaoDoTipo,
  type TipoArquivoDerivado,
} from "@/modules/conferencia-derivados/constants/tipos-arquivo";
import type {
  ResultadoConferencia,
  ResultadoTipo,
} from "@/modules/conferencia-derivados/types/conferenciaDerivados.types";

import { obterPastasPorTipo } from "./config";
import {
  adicionarNomeAoIndice,
  codigoTemArquivo,
  criarIndiceNomes,
  type IndiceNomes,
} from "./regra-codigo";

class PastaInacessivelError extends Error {}

/*
 * Lê a pasta com todas as subpastas (o rglob do Python) e indexa os
 * nomes dos arquivos daquela extensão. Lista de novo a cada conferência,
 * sem cache: quem acabou de exportar um PDF e confere em seguida tem de
 * ver o arquivo. Custo medido: ~7,6s para os 264 mil PDFs, ~1,4s DXF,
 * ~0,1s STEP.
 *
 * A pasta RAIZ ilegível vira erro -- o Python devolvia lista vazia e aí
 * todos os códigos saíam como faltando, um alarme falso com cara de
 * resultado. Subpasta ilegível é pulada, como no Lantek/TuBest.
 */
async function indexarPasta(
  pastaBase: string,
  extensao: string
): Promise<{ indice: IndiceNomes; total: number }> {
  const indice = criarIndiceNomes();
  let total = 0;

  async function percorrer(pasta: string, raiz: boolean) {
    let entradas;

    try {
      entradas = await fs.readdir(pasta, { withFileTypes: true });
    } catch (erro) {
      if (raiz) {
        throw new PastaInacessivelError(
          erro instanceof Error ? erro.message : String(erro)
        );
      }
      return;
    }

    const subPastas: string[] = [];

    for (const entrada of entradas) {
      if (entrada.isDirectory()) {
        subPastas.push(path.join(pasta, entrada.name));
        continue;
      }

      if (!entrada.isFile()) continue;

      const ext = path.extname(entrada.name);
      if (ext.toLowerCase() !== extensao) continue;

      adicionarNomeAoIndice(indice, entrada.name.slice(0, entrada.name.length - ext.length));
      total += 1;
    }

    await Promise.all(subPastas.map((sub) => percorrer(sub, false)));
  }

  await percorrer(pastaBase, true);

  return { indice, total };
}

async function conferirTipo(
  tipo: TipoArquivoDerivado,
  pasta: string | null,
  codigos: string[]
): Promise<ResultadoTipo> {
  const definicao = definicaoDoTipo(tipo);
  const vazio = { tipo, pasta: pasta ?? "", totalArquivosNaPasta: 0, encontrados: 0, faltando: [] };

  if (!pasta) {
    return {
      ...vazio,
      erro: `A pasta de ${definicao.rotulo} não está configurada. Peça a um administrador para preencher em Administração > Configurações.`,
    };
  }

  try {
    const { indice, total } = await indexarPasta(pasta, definicao.extensao);
    const faltando = codigos.filter((codigo) => !codigoTemArquivo(indice, codigo));

    return {
      tipo,
      pasta,
      totalArquivosNaPasta: total,
      encontrados: codigos.length - faltando.length,
      faltando,
      erro: null,
    };
  } catch (erro) {
    if (erro instanceof PastaInacessivelError) {
      console.error(`Conferência de derivados: pasta de ${definicao.rotulo} inacessível:`, erro.message);
      return {
        ...vazio,
        erro: `Não foi possível ler a pasta de ${definicao.rotulo} (${pasta}). Sem ela, nenhum código foi dado como faltando.`,
      };
    }

    throw erro;
  }
}

export async function conferirArquivosDerivados(
  codigos: string[],
  tipos: TipoArquivoDerivado[]
): Promise<ResultadoConferencia> {
  const inicio = Date.now();
  const pastas = await obterPastasPorTipo();

  /* Pastas diferentes, servidor de arquivo único: em paralelo. */
  const resultados = await Promise.all(
    tipos.map((tipo) => conferirTipo(tipo, pastas[tipo], codigos))
  );

  return {
    totalCodigos: codigos.length,
    tipos: resultados,
    duracaoMs: Date.now() - inicio,
  };
}
