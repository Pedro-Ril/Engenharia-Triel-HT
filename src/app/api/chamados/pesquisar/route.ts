import { NextResponse } from "next/server";

import { getUsuarioAutenticado } from "@/lib/auth/autorizacao";
import { pesquisarChamados } from "@/lib/chamados/chamados";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TAMANHO_MINIMO_TERMO = 2;

/*
 * Pública (ver src/lib/auth/rotas-publicas.ts) — usada pela busca
 * por título/descrição em /chamados/consultar. Sem sessão, só
 * chamados marcados como `publico` aparecem; com sessão, também
 * entram os chamados do próprio usuário (ver pesquisarChamados).
 */
async function handleGET(request: Request) {
  const termo = new URL(request.url).searchParams.get("q")?.trim() ?? "";

  if (termo.length < TAMANHO_MINIMO_TERMO) {
    return NextResponse.json({ ok: true, data: [] });
  }

  try {
    const usuario = await getUsuarioAutenticado();
    const resultados = await pesquisarChamados(termo, usuario?.id ?? null);

    return NextResponse.json({ ok: true, data: resultados });
  } catch (error) {
    console.error("Erro ao pesquisar chamados:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível pesquisar chamados." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("chamados/pesquisar", handleGET);
