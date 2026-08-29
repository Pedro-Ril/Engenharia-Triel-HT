import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { listarItensMateriaPrimaCachePaginado } from "@/lib/materias-primas/materias-primas";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { searchParams } = new URL(request.url);
  const codEmpresa = searchParams.get("codEmpresa")?.trim();

  if (!codEmpresa) {
    return NextResponse.json(
      { ok: false, message: "Informe o código da empresa." },
      { status: 400 }
    );
  }

  const pagina = Number(searchParams.get("pagina")) || 1;
  const busca = searchParams.get("busca") ?? "";

  try {
    const resultado = await listarItensMateriaPrimaCachePaginado(codEmpresa, { pagina, busca });
    return NextResponse.json({ ok: true, data: resultado });
  } catch (error) {
    console.error("Erro ao listar itens do catálogo de matéria-prima:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar os itens do catálogo." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/materias-primas/itens", handleGET);
