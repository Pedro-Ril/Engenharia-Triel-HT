import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

import { ValidationError } from "@/lib/auth/errors";
import { verificarAcessoIntegraLantekApi } from "@/lib/integra-lantek/autorizacao-integra-lantek";
import { obterConfigParaRotas } from "@/lib/integra-lantek/integra-lantek-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sanitizarCodigo(valor: string): string {
  const limpo = path.basename(String(valor ?? "").trim());
  return limpo === "." || limpo === ".." ? "" : limpo;
}

function caminhoDentroDaPasta(caminho: string, pastaDesenhos: string): boolean {
  const base = path.resolve(pastaDesenhos);
  const resolvido = path.resolve(caminho);
  const relativo = path.relative(base, resolvido);

  return (
    relativo !== "" && !relativo.startsWith("..") && !path.isAbsolute(relativo)
  );
}

async function resolverCaminhoPdf(
  codigo: string,
  codDesenho: string,
  pastaDesenhos: string
): Promise<string | null> {
  const candidatos = [codigo, codDesenho]
    .map(sanitizarCodigo)
    .filter(Boolean);

  for (const candidato of candidatos) {
    for (const extensao of [".pdf", ".PDF"]) {
      const caminho = path.join(pastaDesenhos, `${candidato}${extensao}`);
      if (!caminhoDentroDaPasta(caminho, pastaDesenhos)) continue;

      try {
        await fs.access(caminho);
        return caminho;
      } catch {
        continue;
      }
    }
  }

  return null;
}

function obterCodigoDoArquivo(arquivo: string): string {
  const decodificado = decodeURIComponent(arquivo);
  return sanitizarCodigo(decodificado.replace(/\.pdf$/i, ""));
}

type RouteParams = { params: Promise<{ arquivo: string }> };

export async function HEAD(request: NextRequest, { params }: RouteParams) {
  const acesso = await verificarAcessoIntegraLantekApi();
  if (acesso.negado) return new NextResponse(null, { status: acesso.negado.status });

  const { arquivo } = await params;
  const codigo = obterCodigoDoArquivo(arquivo);
  const codDesenho = sanitizarCodigo(
    new URL(request.url).searchParams.get("codDesenho") ?? ""
  );

  if (!codigo && !codDesenho) {
    return new NextResponse(null, { status: 400 });
  }

  let config;
  try {
    config = await obterConfigParaRotas();
  } catch {
    return new NextResponse(null, { status: 500 });
  }

  const caminho = await resolverCaminhoPdf(codigo, codDesenho, config.pastaDesenhos);
  return new NextResponse(null, { status: caminho ? 200 : 404 });
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const acesso = await verificarAcessoIntegraLantekApi();
  if (acesso.negado) return acesso.negado;

  try {
    const { arquivo } = await params;
    const codigo = obterCodigoDoArquivo(arquivo);
    const codDesenho = sanitizarCodigo(
      new URL(request.url).searchParams.get("codDesenho") ?? ""
    );

    if (!codigo && !codDesenho) {
      return NextResponse.json(
        { error: "Informe o código do item para buscar o PDF." },
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

    const caminho = await resolverCaminhoPdf(codigo, codDesenho, config.pastaDesenhos);

    if (!caminho) {
      return NextResponse.json(
        { error: "Nenhum PDF encontrado para este código." },
        { status: 404 }
      );
    }

    const conteudo = await fs.readFile(caminho);
    const nomeSemExtensao = path.basename(caminho, path.extname(caminho));

    return new NextResponse(new Uint8Array(conteudo), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${nomeSemExtensao}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Erro ao ler o arquivo PDF.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
