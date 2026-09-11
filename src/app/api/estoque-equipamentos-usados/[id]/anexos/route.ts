import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { listarAnexosDoEquipamento } from "@/lib/estoque-equipamentos-usados/movimentacoes-anexos";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODULO_CHAVE = "estoque-equipamentos-usados";

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function handleGET(request: Request, context: RouteContext) {
  const acesso = await verificarAcessoModuloApi(MODULO_CHAVE);
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  try {
    const anexos = await listarAnexosDoEquipamento(id);
    return NextResponse.json({ ok: true, data: anexos });
  } catch (error) {
    console.error("Erro ao listar anexos das movimentações do equipamento:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar os anexos." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("estoque-equipamentos-usados/[id]/anexos", handleGET);
