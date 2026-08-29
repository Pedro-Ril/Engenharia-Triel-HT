import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { listarEmpresasComCatalogo } from "@/lib/materias-primas/materias-primas";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const empresas = await listarEmpresasComCatalogo();
    return NextResponse.json({ ok: true, data: empresas });
  } catch (error) {
    console.error("Erro ao listar empresas com catálogo de matéria-prima:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar as empresas." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/materias-primas/empresas", handleGET);
