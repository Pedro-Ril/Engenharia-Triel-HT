import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { carregarConfigRoteiro } from "@/lib/tempos-maquina/roteiro";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Perfis ativos, máquinas ligadas a eles e materiais: o que o cálculo automático do Roteiro usa. */
async function handleGET() {
  const acesso = await verificarAcessoModuloApi("cadastro-roteiro");
  if (acesso.negado) return acesso.negado;

  try {
    return NextResponse.json({ ok: true, data: await carregarConfigRoteiro() });
  } catch (error) {
    console.error("Erro ao carregar os tempos de máquina:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível carregar os tempos de máquina." }, { status: 500 });
  }
}

export const GET = comMetricasApi("cadastro-roteiro/tempos", handleGET);
