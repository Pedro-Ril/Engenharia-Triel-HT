import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { listarHistoricoSubstituicao } from "@/lib/estrutura-substituicao/estrutura-substituicao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ITENS_POR_PAGINA = 20;

async function handleGET(request: Request) {
  const acesso = await verificarAcessoModuloApi("substituicao-estrutura");
  if (acesso.negado) return acesso.negado;

  try {
    const { searchParams } = new URL(request.url);
    const paginaParam = Number(searchParams.get("pagina"));
    const pagina = Number.isFinite(paginaParam) && paginaParam > 0 ? Math.trunc(paginaParam) : 1;
    const codPai = searchParams.get("codPai")?.trim() || undefined;

    const resultado = await listarHistoricoSubstituicao(pagina, ITENS_POR_PAGINA, { codPai });

    return NextResponse.json({
      ok: true,
      data: {
        itens: resultado.itens,
        total: resultado.total,
        totalPaginas: Math.max(1, Math.ceil(resultado.total / ITENS_POR_PAGINA)),
      },
    });
  } catch (error) {
    console.error("Erro ao listar histórico de substituição de estrutura:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível carregar o histórico." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("estrutura-substituicao/historico", handleGET);
