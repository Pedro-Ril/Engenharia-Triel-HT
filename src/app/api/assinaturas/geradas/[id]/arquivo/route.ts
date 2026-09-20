import { NextResponse } from "next/server";

import { buscarImagemAssinaturaGerada, registrarDownloadSemFalhar } from "@/lib/assinaturas/geradas";
import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uniqueIdentifierPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteContext {
  params: Promise<{ id: string }>;
}

/* Lista/download são compartilhados -- qualquer usuário com acesso ao módulo pode baixar qualquer assinatura, não só quem gerou (decisão do usuário). */
async function handleGET(_request: Request, context: RouteContext) {
  const acesso = await verificarAcessoModuloApi("assinaturas");
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  if (!uniqueIdentifierPattern.test(id)) {
    return NextResponse.json({ ok: false, message: "Identificador inválido." }, { status: 400 });
  }

  try {
    const imagem = await buscarImagemAssinaturaGerada(id);

    if (!imagem) {
      return NextResponse.json({ ok: false, message: "Assinatura não encontrada." }, { status: 404 });
    }

    await registrarDownloadSemFalhar(id, acesso.usuario);

    return new NextResponse(new Uint8Array(imagem.conteudo), {
      headers: {
        "Content-Type": imagem.tipoMime,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(imagem.nomeArquivo)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Erro ao baixar assinatura gerada:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível baixar a assinatura." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("assinaturas/geradas/[id]/arquivo", handleGET);
