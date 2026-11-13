import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { listarVinculosUnidades } from "@/lib/empresas/unidades";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Todos os vínculos usuário -> unidade (a tela de Usuários cruza com a lista de usuários). */
async function handleGET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    return NextResponse.json({ ok: true, data: await listarVinculosUnidades() });
  } catch (error) {
    console.error("Erro ao listar vínculos de unidade:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar as unidades dos usuários." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/usuarios/unidades", handleGET);
