import { NextResponse } from "next/server";

import { obterDadosPainelBi } from "@/lib/estoque-equipamentos-usados/painel-bi";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Rota pública (ver src/lib/auth/rotas-publicas.ts) — o painel de BI
 * roda numa TV sem ninguém logado (via TV Corporativa, como slide de
 * página web, ou aberta direto num navegador em modo kiosk), então não
 * pode depender de sessão de usuário, que expira em poucas horas. Só
 * números agregados são expostos aqui, nada de dado sensível por
 * cliente/equipamento individual além do que já aparece no extrato.
 */
async function handleGET() {
  try {
    const dados = await obterDadosPainelBi();
    return NextResponse.json({ ok: true, data: dados });
  } catch (error) {
    console.error("Erro ao montar o painel de BI de equipamentos usados:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível carregar o painel." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("estoque-equipamentos-usados/painel", handleGET);
