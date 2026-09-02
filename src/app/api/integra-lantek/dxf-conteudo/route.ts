import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

import { ValidationError } from "@/lib/auth/errors";
import { verificarAcessoIntegraLantekApi } from "@/lib/integra-lantek/autorizacao-integra-lantek";
import { obterConfigParaRotas } from "@/lib/integra-lantek/integra-lantek-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function caminhoPermitido(caminho: string, pastaDxf: string): boolean {
  if (!/\.dxf$/i.test(caminho)) return false;

  const base = path.resolve(pastaDxf);
  const resolvido = path.resolve(caminho);
  const relativo = path.relative(base, resolvido);

  return (
    relativo !== "" &&
    !relativo.startsWith("..") &&
    !path.isAbsolute(relativo)
  );
}

export async function GET(request: NextRequest) {
  const acesso = await verificarAcessoIntegraLantekApi();
  if (acesso.negado) return acesso.negado;

  try {
    const { searchParams } = new URL(request.url);
    const caminho = searchParams.get("caminho") ?? "";

    let config;
    try {
      config = await obterConfigParaRotas();
    } catch (error) {
      if (error instanceof ValidationError) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      throw error;
    }

    if (!caminho || !caminhoPermitido(caminho, config.pastaDxf)) {
      return NextResponse.json(
        { error: "Caminho de arquivo inválido." },
        { status: 400 }
      );
    }

    const conteudo = await fs.readFile(caminho);

    return new NextResponse(new Uint8Array(conteudo), {
      status: 200,
      headers: {
        "Content-Type": "application/dxf",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const naoEncontrado =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "ENOENT";

    return NextResponse.json(
      {
        error: naoEncontrado
          ? "Arquivo DXF não encontrado no caminho informado."
          : "Erro ao ler o arquivo DXF.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: naoEncontrado ? 404 : 500 }
    );
  }
}
