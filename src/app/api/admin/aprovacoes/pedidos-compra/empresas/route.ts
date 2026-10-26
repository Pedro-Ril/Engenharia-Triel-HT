import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { listarEscopoEmpresas } from "@/lib/aprovacoes/pedidos-compra-admin";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Empresas que cada diretor aprova (só quem tem alguma marcada aparece). */
async function handleGET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    return NextResponse.json({ ok: true, data: await listarEscopoEmpresas() });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao listar as empresas dos diretores:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar as empresas dos diretores." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/aprovacoes/pedidos-compra/empresas", handleGET);
