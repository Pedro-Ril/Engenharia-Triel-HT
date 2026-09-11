import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { listarTiposEquipamento } from "@/lib/estoque-equipamentos-usados/tipos-equipamento";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET() {
  const acesso = await verificarAcessoModuloApi("estoque-equipamentos-usados");
  if (acesso.negado) return acesso.negado;

  try {
    const tipos = await listarTiposEquipamento(true);
    return NextResponse.json({ ok: true, data: tipos });
  } catch (error) {
    console.error("Erro ao listar tipos de equipamento ativos:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar os tipos de equipamento." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("estoque-equipamentos-usados/tipos", handleGET);
