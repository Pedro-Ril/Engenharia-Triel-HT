import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { listarTodasTransferencias } from "@/lib/transferencia/transferencias";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const transferencias = await listarTodasTransferencias();
    return NextResponse.json({ ok: true, data: transferencias });
  } catch (error) {
    console.error("Erro ao listar transferências (admin):", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar as transferências." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/transferencia-arquivos", handleGET);
