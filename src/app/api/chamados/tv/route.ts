import { NextResponse } from "next/server";

import { obterPainelTvChamados, resolverSetorDaUrlTv } from "@/lib/chamados/painel-tv";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Rota PÚBLICA (prefixo /api/chamados em src/lib/auth/rotas-publicas.ts)
 * de propósito: alimenta o BI de chamados que roda numa TV da sala sem
 * ninguém logado (/chamados/dashboard/tv), como o BI de Equipamentos
 * Usados. Decisão registrada com o responsável: título do chamado e nome
 * do solicitante aparecem na tela. Só leitura; ?setor= restringe a um
 * setor (nome, chave ou id -- ver src/lib/chamados/setor-url-tv.ts).
 */
async function handleGET(request: Request) {
  try {
    const setorUrl = new URL(request.url).searchParams.get("setor");
    const { setorId, naoEncontrado } = await resolverSetorDaUrlTv(setorUrl);

    if (naoEncontrado) {
      return NextResponse.json(
        {
          ok: false,
          message: `Setor "${(setorUrl ?? "").trim().slice(0, 60)}" não encontrado. Confira o endereço da TV.`,
        },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, data: await obterPainelTvChamados(setorId) });
  } catch (error) {
    console.error("Erro ao montar o BI de chamados (TV):", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível carregar o painel." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("chamados/tv", handleGET);
