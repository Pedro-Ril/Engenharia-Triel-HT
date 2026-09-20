import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { listarModelosAtivos } from "@/lib/assinaturas/modelos";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET() {
  const acesso = await verificarAcessoModuloApi("assinaturas");
  if (acesso.negado) return acesso.negado;

  try {
    const modelos = await listarModelosAtivos();
    return NextResponse.json({ ok: true, data: modelos });
  } catch (error) {
    console.error("Erro ao listar modelos de assinatura:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível carregar os modelos." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("assinaturas/modelos", handleGET);
