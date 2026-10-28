import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { buscarFluxoDoItem } from "@/lib/aprovacoes/alcadas/fluxo";
import { buscarItemPorId } from "@/lib/aprovacoes/aprovacoes";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODULO_CHAVE = "aprovacoes-minhas-solicitacoes";

interface RouteContext {
  params: Promise<{ itemId: string }>;
}

const formatoId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* Cadeia e histórico de um colaborador da PRÓPRIA solicitação -- onde está, quem aprovou, por que voltou. */
async function handleGET(_request: Request, context: RouteContext) {
  const acesso = await verificarAcessoModuloApi(MODULO_CHAVE);
  if (acesso.negado) return acesso.negado;

  const { itemId } = await context.params;

  try {
    const item = formatoId.test(itemId) ? await buscarItemPorId(itemId, acesso.usuario.id) : null;

    if (!item || item.criadoPorUsuarioId.toUpperCase() !== acesso.usuario.id.toUpperCase()) {
      return NextResponse.json({ ok: false, message: "Colaborador não encontrado." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data: { ...item, fluxo: await buscarFluxoDoItem(itemId) } });
  } catch (error) {
    console.error("Erro ao buscar o andamento do colaborador:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível carregar o andamento." }, { status: 500 });
  }
}

export const GET = comMetricasApi("aprovacoes/minhas/itens/[itemId]", handleGET);
