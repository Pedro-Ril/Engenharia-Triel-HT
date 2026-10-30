import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject } from "@/lib/auth/validation";
import { sincronizarExtrato } from "@/lib/estoque-equipamentos-usados/extrato-integracao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Sincroniza todos os equipamentos pelo extrato do ERP agora.
 * { simular: true } roda tudo e desfaz no fim: mostra o que mudaria
 * (status, movimentações) sem gravar nada.
 */
async function handlePOST(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const corpo: unknown = await request.json().catch(() => ({}));
    const simular = isObject(corpo) && corpo.simular === true;
    const resultados = await sincronizarExtrato({ disparadoPor: acesso.usuario.nomeExibicao, simular });
    return NextResponse.json({
      ok: true,
      message: simular ? "Simulação concluída (nada foi gravado)." : "Sincronização concluída.",
      data: { simular, resultados },
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    console.error("Erro ao sincronizar o extrato do ERP:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível sincronizar com o ERP." }, { status: 500 });
  }
}

export const POST = comMetricasApi("admin/estoque-equipamentos-usados/extrato", handlePOST);
