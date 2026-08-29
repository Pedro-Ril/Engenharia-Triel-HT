import { NextResponse } from "next/server";

import { getUsuarioAutenticado } from "@/lib/auth/autorizacao";
import { verificarAcessoChamado } from "@/lib/chamados/autorizacao-chamados";
import { buscarAnexoConteudo, buscarContextoAnexo } from "@/lib/chamados/chamados";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uniqueIdentifierPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function handleGET(request: Request, context: RouteContext) {
  const { id } = await context.params;

  if (!uniqueIdentifierPattern.test(id)) {
    return NextResponse.json(
      { ok: false, message: "Identificador de anexo inválido." },
      { status: 400 }
    );
  }

  try {
    const contexto = await buscarContextoAnexo(id);

    if (!contexto) {
      return NextResponse.json(
        { ok: false, message: "Anexo não encontrado." },
        { status: 404 }
      );
    }

    const usuario = await getUsuarioAutenticado();
    const nomeConfirmado = new URL(request.url).searchParams.get("nome");

    const { podeVer, ehAtendente } = await verificarAcessoChamado(
      { id: contexto.chamadoId, setorId: contexto.setorId, solicitanteUsuarioId: contexto.solicitanteUsuarioId, solicitanteNome: contexto.solicitanteNome },
      usuario,
      nomeConfirmado
    );

    if (!podeVer || (contexto.mensagemInterna && !ehAtendente)) {
      return NextResponse.json(
        { ok: false, message: "Você não tem acesso a este anexo." },
        { status: 403 }
      );
    }

    const anexo = await buscarAnexoConteudo(id);

    if (!anexo) {
      return NextResponse.json(
        { ok: false, message: "Anexo não encontrado." },
        { status: 404 }
      );
    }

    return new NextResponse(new Uint8Array(anexo.conteudo), {
      headers: {
        "Content-Type": anexo.tipoMime,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(anexo.nomeArquivo)}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Erro ao baixar anexo de chamado:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível baixar o anexo." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("chamados/anexos/[id]", handleGET);
