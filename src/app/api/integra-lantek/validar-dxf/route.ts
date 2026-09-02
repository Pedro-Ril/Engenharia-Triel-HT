import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

import { ValidationError } from "@/lib/auth/errors";
import { verificarAcessoIntegraLantekApi } from "@/lib/integra-lantek/autorizacao-integra-lantek";
import { obterConfigParaRotas } from "@/lib/integra-lantek/integra-lantek-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ItemValidacao = {
  codigo: string;
  codDesenho?: string | null;
};

type RequestBody = {
  itens: ItemValidacao[];
};

type ArquivoEncontrado = {
  caminho: string;
  arquivo: string;
};

async function listarDxfRecursivo(
  pastaBase: string
): Promise<Map<string, ArquivoEncontrado[]>> {
  const indice = new Map<string, ArquivoEncontrado[]>();

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

      const chave = path
        .basename(entrada.name, path.extname(entrada.name))
        .trim()
        .toLowerCase();

      const encontrado: ArquivoEncontrado = {
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

  return indice;
}

function buscarNoIndice(
  indice: Map<string, ArquivoEncontrado[]>,
  codigo: string
): ArquivoEncontrado[] {
  const chave = codigo.trim().toLowerCase();
  if (!chave) return [];
  return indice.get(chave) ?? [];
}

export async function POST(request: NextRequest) {
  const acesso = await verificarAcessoIntegraLantekApi();
  if (acesso.negado) return acesso.negado;

  try {
    const body = (await request.json()) as RequestBody;
    const itens = Array.isArray(body?.itens) ? body.itens : [];

    if (!itens.length) {
      return NextResponse.json(
        { error: "Nenhum item foi informado para validação." },
        { status: 400 }
      );
    }

    const itensNormalizados = itens
      .map((item) => ({
        codigo: String(item?.codigo ?? "").trim(),
        codDesenho: String(item?.codDesenho ?? "").trim(),
      }))
      .filter((item) => item.codigo || item.codDesenho);

    if (!itensNormalizados.length) {
      return NextResponse.json(
        { error: "Nenhum código válido foi informado para validação." },
        { status: 400 }
      );
    }

    let config;
    try {
      config = await obterConfigParaRotas();
    } catch (error) {
      if (error instanceof ValidationError) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      throw error;
    }

    const indice = await listarDxfRecursivo(config.pastaDxf);

    const resultados = itensNormalizados.map(({ codigo, codDesenho }) => {
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

      const principal = encontrados[0];

      return {
        codigo,
        codDesenho,
        codigoUsado,
        origem,
        existe: encontrados.length > 0,
        duplicado: encontrados.length > 1,
        caminho: principal?.caminho ?? "",
        arquivo: principal?.arquivo ?? "",
        caminhos: encontrados.map((item) => item.caminho),
      };
    });

    return NextResponse.json({
      success: true,
      total: resultados.length,
      resultados,
    });
  } catch (error) {
    console.error("Erro ao validar DXF:", error);

    return NextResponse.json(
      {
        error: "Erro interno ao validar os arquivos DXF.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
