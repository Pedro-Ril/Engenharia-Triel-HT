import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { listarCamposComPendencia } from "@/lib/estoque-equipamentos-usados/tipos-equipamento";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODULO_CHAVE = "estoque-equipamentos-usados";

async function handleGET() {
  const acesso = await verificarAcessoModuloApi(MODULO_CHAVE);
  if (acesso.negado) return acesso.negado;

  try {
    const campos = await listarCamposComPendencia();
    return NextResponse.json({ ok: true, data: campos });
  } catch (error) {
    console.error("Erro ao listar campos com pendência:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar as pendências." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("estoque-equipamentos-usados/pendencias", handleGET);
