import { NextResponse } from "next/server";

import { buscarLotePorNumero } from "@/lib/aprovacoes/aprovacoes";
import { requireAtendenteAprovacaoApi } from "@/lib/aprovacoes/autorizacao-aprovacoes";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ numero: string }>;
}

function parseNumero(valor: string): number | null {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0 ? numero : null;
}

/* Devolve o lote inteiro (todos os colaboradores, cada um com seu próprio status) -- a tela de criar não reconsulta, o próprio POST de criação já devolve o lote criado. */
async function handleGET(request: Request, context: RouteContext) {
  const acesso = await requireAtendenteAprovacaoApi("aumento_salarial");
  if (acesso.negado) return acesso.negado;

  const { numero: numeroParam } = await context.params;
  const numero = parseNumero(numeroParam);

  if (!numero) {
    return NextResponse.json({ ok: false, message: "Número de solicitação inválido." }, { status: 400 });
  }

  try {
    const lote = await buscarLotePorNumero(numero);

    if (!lote) {
      return NextResponse.json({ ok: false, message: "Solicitação não encontrada." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data: lote });
  } catch (error) {
    console.error("Erro ao buscar solicitação de aprovação:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível carregar a solicitação." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("aprovacoes/[numero]", handleGET);
