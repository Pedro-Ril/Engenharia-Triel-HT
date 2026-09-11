import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { buscarAnexoMovimentacao } from "@/lib/estoque-equipamentos-usados/movimentacoes-anexos";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODULO_CHAVE = "estoque-equipamentos-usados";
const uniqueIdentifierPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function handleGET(request: Request, context: RouteContext) {
  const acesso = await verificarAcessoModuloApi(MODULO_CHAVE);
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  if (!uniqueIdentifierPattern.test(id)) {
    return NextResponse.json({ ok: false, message: "Anexo inválido." }, { status: 400 });
  }

  try {
    const anexo = await buscarAnexoMovimentacao(id);

    if (!anexo) {
      return NextResponse.json({ ok: false, message: "Anexo não encontrado." }, { status: 404 });
    }

    const nomeArquivoAscii = anexo.nomeArquivo.replace(/[^\x20-\x7e]/g, "_");

    return new NextResponse(new Uint8Array(anexo.conteudo), {
      headers: {
        "Content-Type": anexo.tipoMime,
        "Content-Disposition": `inline; filename="${nomeArquivoAscii}"; filename*=UTF-8''${encodeURIComponent(anexo.nomeArquivo)}`,
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (error) {
    console.error("Erro ao servir anexo de movimentação:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível carregar o anexo." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("estoque-equipamentos-usados/anexos/[id]", handleGET);
