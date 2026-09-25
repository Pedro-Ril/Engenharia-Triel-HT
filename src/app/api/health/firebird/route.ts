import { NextResponse } from "next/server";

import { fbQuery } from "@/lib/database/firebird";
import { registrarChamadaExternaSemFalhar } from "@/lib/monitoramento/chamadas-externas";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Espelha src/app/api/health/database/route.ts (SQL Server) -- mesma ideia, sem guarda de acesso, pra Firebird. */
async function handleGET() {
  const inicio = performance.now();

  try {
    const resultado = await fbQuery<{ AGORA: string }>("SELECT CAST(CURRENT_TIMESTAMP AS VARCHAR(33)) AS AGORA FROM RDB$DATABASE");

    await registrarChamadaExternaSemFalhar({
      servico: "erp_rh_firebird",
      origem: "health_check",
      sucesso: true,
      duracaoMs: performance.now() - inicio,
    });

    return NextResponse.json({
      ok: true,
      message: "Conexão com o Firebird realizada com sucesso.",
      data: { horaServidor: resultado[0]?.AGORA ?? null },
    });
  } catch (error) {
    console.error("Erro ao conectar com o Firebird:", error);

    await registrarChamadaExternaSemFalhar({
      servico: "erp_rh_firebird",
      origem: "health_check",
      sucesso: false,
      duracaoMs: performance.now() - inicio,
      mensagemErro: error instanceof Error ? error.message : "Erro desconhecido.",
    });

    return NextResponse.json(
      { ok: false, message: "Não foi possível conectar ao Firebird." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("health/firebird", handleGET);
