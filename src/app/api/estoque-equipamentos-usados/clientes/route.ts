import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { listarClientesErp } from "@/lib/estoque-equipamentos-usados/erp-integracao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODULO_CHAVE = "estoque-equipamentos-usados";

async function handleGET() {
  const acesso = await verificarAcessoModuloApi(MODULO_CHAVE);
  if (acesso.negado) return acesso.negado;

  try {
    const clientes = await listarClientesErp();
    return NextResponse.json({ ok: true, data: clientes });
  } catch (error) {
    console.error("Erro ao listar clientes do ERP (estoque de equipamentos usados):", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar os clientes." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("estoque-equipamentos-usados/clientes", handleGET);
