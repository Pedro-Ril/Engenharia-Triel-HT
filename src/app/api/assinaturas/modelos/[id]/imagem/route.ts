import { NextResponse } from "next/server";

import { buscarImagemModelo } from "@/lib/assinaturas/modelos";
import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uniqueIdentifierPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function handleGET(_request: Request, context: RouteContext) {
  const acesso = await verificarAcessoModuloApi("assinaturas");
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  if (!uniqueIdentifierPattern.test(id)) {
    return NextResponse.json({ ok: false, message: "Identificador inválido." }, { status: 400 });
  }

  try {
    const imagem = await buscarImagemModelo(id);

    if (!imagem) {
      return NextResponse.json({ ok: false, message: "Modelo não encontrado." }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(imagem.conteudo), {
      headers: {
        "Content-Type": imagem.tipoMime,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Erro ao servir imagem de modelo de assinatura:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível carregar a imagem." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("assinaturas/modelos/[id]/imagem", handleGET);
