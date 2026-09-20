import { NextResponse } from "next/server";

import { buscarImagemModeloAdmin } from "@/lib/assinaturas/modelos";
import { requireAdminApi } from "@/lib/auth/autorizacao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/* Igual a /api/assinaturas/modelos/[id]/imagem, mas sem filtrar por ativo -- o admin precisa ver/editar modelos desativados também. */
async function handleGET(_request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  try {
    const imagem = await buscarImagemModeloAdmin(id);

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
    console.error("Erro ao servir imagem de modelo de assinatura (admin):", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível carregar a imagem." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/assinaturas/modelos/[id]/imagem", handleGET);
