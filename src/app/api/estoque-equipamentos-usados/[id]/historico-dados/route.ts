import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { listarHistoricoAlteracoesDados } from "@/lib/estoque-equipamentos-usados/estoque-equipamentos-usados";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODULO_CHAVE = "estoque-equipamentos-usados";

const uniqueIdentifierPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function handleGET(request: Request, context: RouteContext) {
  const acesso = await verificarAcessoModuloApi(MODULO_CHAVE);
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  if (!uniqueIdentifierPattern.test(id)) {
    return NextResponse.json({ ok: false, message: "Equipamento inválido." }, { status: 400 });
  }

  try {
    const historico = await listarHistoricoAlteracoesDados(id);
    return NextResponse.json({ ok: true, data: historico });
  } catch (error) {
    console.error("Erro ao buscar histórico de alterações do equipamento:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível carregar o histórico de alterações." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("estoque-equipamentos-usados/[id]/historico-dados", handleGET);
