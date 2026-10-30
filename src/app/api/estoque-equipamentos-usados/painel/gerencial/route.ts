import { NextResponse } from "next/server";

import { obterDadosPainelBi } from "@/lib/estoque-equipamentos-usados/painel-bi";
import { obterDadosPainelGerencial } from "@/lib/estoque-equipamentos-usados/painel-gerencial";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Painel gerencial (TV, rota pública como a do painel de BI -- ver
 * src/lib/auth/rotas-publicas.ts): as duas páginas numa chamada só,
 * "onde está o estoque" (a mesma do painel de BI) e "quanto vale e há
 * quanto tempo". Só números agregados e nomes de cliente, como no painel
 * de BI.
 */
async function handleGET() {
  try {
    const [quantidade, gerencial] = await Promise.all([obterDadosPainelBi(), obterDadosPainelGerencial()]);
    return NextResponse.json({ ok: true, data: { quantidade, gerencial } });
  } catch (error) {
    console.error("Erro ao montar o painel gerencial de equipamentos usados:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível carregar o painel." }, { status: 500 });
  }
}

export const GET = comMetricasApi("estoque-equipamentos-usados/painel/gerencial", handleGET);
