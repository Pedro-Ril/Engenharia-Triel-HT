import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { buscarEvidencia, excluirEvidencia } from "@/lib/estoque-equipamentos-usados/evidencias";
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
    return NextResponse.json({ ok: false, message: "Evidência inválida." }, { status: 400 });
  }

  try {
    const evidencia = await buscarEvidencia(id);

    if (!evidencia) {
      return NextResponse.json({ ok: false, message: "Evidência não encontrada." }, { status: 404 });
    }

    const nomeArquivoAscii = evidencia.nomeArquivo.replace(/[^\x20-\x7e]/g, "_");

    return new NextResponse(new Uint8Array(evidencia.conteudo), {
      headers: {
        "Content-Type": evidencia.tipoMime,
        "Content-Disposition": `inline; filename="${nomeArquivoAscii}"; filename*=UTF-8''${encodeURIComponent(evidencia.nomeArquivo)}`,
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (error) {
    console.error("Erro ao servir evidência de equipamento:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível carregar a evidência." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("estoque-equipamentos-usados/evidencias/[id]", handleGET);

async function handleDELETE(request: Request, context: RouteContext) {
  const acesso = await verificarAcessoModuloApi(MODULO_CHAVE);
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  try {
    await excluirEvidencia(id);
    return NextResponse.json({ ok: true, message: "Evidência excluída." });
  } catch (error) {
    console.error("Erro ao excluir evidência de equipamento:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível excluir a evidência." },
      { status: 500 }
    );
  }
}

export const DELETE = comMetricasApi("estoque-equipamentos-usados/evidencias/[id]", handleDELETE);
