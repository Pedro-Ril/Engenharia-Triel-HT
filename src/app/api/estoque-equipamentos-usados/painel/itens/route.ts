import { NextResponse } from "next/server";

import { obterPainelItens } from "@/lib/estoque-equipamentos-usados/painel-itens";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * BI de itens (TV, rota pública como a do painel de BI -- ver
 * src/lib/auth/rotas-publicas.ts): a tabela de itens com as informações
 * técnicas. ?condicao=novo para os novos; sem parâmetro, os usados.
 */
async function handleGET(request: Request) {
  try {
    const condicao = new URL(request.url).searchParams.get("condicao") === "novo" ? "novo" : "usado";
    const dados = await obterPainelItens(condicao);
    return NextResponse.json({ ok: true, data: dados });
  } catch (error) {
    console.error("Erro ao montar o BI de itens do estoque de equipamentos:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível carregar o painel." }, { status: 500 });
  }
}

export const GET = comMetricasApi("estoque-equipamentos-usados/painel/itens", handleGET);
