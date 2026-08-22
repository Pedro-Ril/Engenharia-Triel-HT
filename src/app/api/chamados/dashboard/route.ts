import { NextResponse } from "next/server";

import { requireAtendenteChamadosApi } from "@/lib/chamados/autorizacao-chamados";
import { buscarEstatisticasChamados } from "@/lib/chamados/dashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const resultadoAcesso = await requireAtendenteChamadosApi();
  if (resultadoAcesso.negado) return resultadoAcesso.negado;

  const { setorIds } = resultadoAcesso.acesso;
  const url = new URL(request.url);

  const setorId = url.searchParams.get("setorId") ?? undefined;
  const empresa = url.searchParams.get("empresa") ?? undefined;
  const dataInicial = url.searchParams.get("dataInicial") ?? undefined;
  const dataFinal = url.searchParams.get("dataFinal") ?? undefined;

  try {
    const estatisticas = await buscarEstatisticasChamados({
      setorIds,
      setorId,
      empresa,
      dataInicial,
      dataFinal,
    });

    return NextResponse.json({ ok: true, data: estatisticas });
  } catch (error) {
    console.error("Erro ao buscar estatísticas de chamados:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível carregar o dashboard." },
      { status: 500 }
    );
  }
}
