import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { getResumoImpressoes, listarImpressoes } from "@/lib/terminal-fabrica/impressao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const url = new URL(request.url);
  const pagina = Math.max(1, Number(url.searchParams.get("pagina")) || 1);
  const porPagina = Math.min(100, Math.max(1, Number(url.searchParams.get("porPagina")) || 25));

  try {
    const [{ itens, total }, resumo] = await Promise.all([
      listarImpressoes({ pagina, porPagina }),
      getResumoImpressoes(),
    ]);

    return NextResponse.json({ ok: true, data: { impressoes: itens, total, resumo } });
  } catch (error) {
    console.error("Erro ao listar impressões do terminal de fábrica:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar as impressões." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/terminal-fabrica/impressoes", handleGET);
