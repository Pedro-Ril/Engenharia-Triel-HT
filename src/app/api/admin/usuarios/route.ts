import { NextResponse } from "next/server";

import { listarUsuarios } from "@/lib/auth/admin";
import { requireAdminApi } from "@/lib/auth/autorizacao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const usuarios = await listarUsuarios();
    return NextResponse.json({ ok: true, data: usuarios });
  } catch (error) {
    console.error("Erro ao listar usuários:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar os usuários." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/usuarios", handleGET);
