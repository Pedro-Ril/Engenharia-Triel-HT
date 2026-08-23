import { NextResponse } from "next/server";

import { buscarConteudoDownload } from "@/lib/downloads/downloads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uniqueIdentifierPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  if (!uniqueIdentifierPattern.test(id)) {
    return NextResponse.json(
      { ok: false, message: "Identificador de download inválido." },
      { status: 400 }
    );
  }

  try {
    const arquivo = await buscarConteudoDownload(id);

    if (!arquivo) {
      return NextResponse.json(
        { ok: false, message: "Download não encontrado." },
        { status: 404 }
      );
    }

    return new NextResponse(new Uint8Array(arquivo.conteudo), {
      headers: {
        "Content-Type": arquivo.tipoMime,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(arquivo.nomeArquivo)}"`,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Erro ao baixar arquivo:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível baixar o arquivo." },
      { status: 500 }
    );
  }
}
