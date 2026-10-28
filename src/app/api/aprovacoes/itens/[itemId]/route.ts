import { NextResponse } from "next/server";

import { buscarFluxoDoItem } from "@/lib/aprovacoes/alcadas/fluxo";
import { buscarItemPorId } from "@/lib/aprovacoes/aprovacoes";
import { requireAtendenteAprovacaoApi } from "@/lib/aprovacoes/autorizacao-aprovacoes";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ itemId: string }>;
}

/* Só usado pelo modal de detalhe do painel da direção -- um colaborador por vez, já que a decisão agora é por colaborador, não pelo lote inteiro. */
async function handleGET(request: Request, context: RouteContext) {
  const acesso = await requireAtendenteAprovacaoApi("aumento_salarial");
  if (acesso.negado) return acesso.negado;

  const { itemId } = await context.params;

  try {
    /* Só se a cadeia já chegou ao nível de quem pede -- ninguém vê antes da hora. */
    const item = await buscarItemPorId(itemId, acesso.usuario.id, { somenteVisiveis: true });

    if (!item) {
      return NextResponse.json({ ok: false, message: "Colaborador não encontrado." }, { status: 404 });
    }

    const fluxo = await buscarFluxoDoItem(itemId);

    return NextResponse.json({ ok: true, data: { ...item, fluxo } });
  } catch (error) {
    console.error("Erro ao buscar item de aprovação:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível carregar o colaborador." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("aprovacoes/itens/[itemId]", handleGET);
