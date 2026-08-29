import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { listarLogsSincronizacao } from "@/lib/materias-primas/materias-primas";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const logs = await listarLogsSincronizacao(50);
    return NextResponse.json({ ok: true, data: logs });
  } catch (error) {
    console.error("Erro ao listar logs de sincronização de matéria-prima:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar os logs." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/materias-primas/logs", handleGET);
