import { NextResponse } from "next/server";

import { getUsuarioAutenticado } from "@/lib/auth/autorizacao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { buscarImagem } from "@/lib/wiki/wiki-imagens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uniqueIdentifierPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function handleGET(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  if (!uniqueIdentifierPattern.test(id)) {
    return NextResponse.json(
      { ok: false, message: "Identificador de imagem inválido." },
      { status: 400 }
    );
  }

  const usuario = await getUsuarioAutenticado();
  if (!usuario) {
    return NextResponse.json(
      { ok: false, message: "Você precisa estar autenticado para ver esta imagem." },
      { status: 401 }
    );
  }

  try {
    const imagem = await buscarImagem(id);

    if (!imagem) {
      return NextResponse.json({ ok: false, message: "Imagem não encontrada." }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(imagem.conteudo), {
      headers: {
        "Content-Type": imagem.tipoMime,
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (error) {
    console.error("Erro ao servir imagem do wiki:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível carregar a imagem." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("wiki/imagens/[id]", handleGET);
