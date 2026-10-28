import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import {
  lerCorpoAlcada,
  listarAlcadas,
  listarHistoricoAlcadas,
  listarSetoresConhecidos,
  salvarAlcada,
} from "@/lib/aprovacoes/alcadas/config";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Alçadas ativas de todos os tipos, o histórico recente de mudanças e os setores conhecidos. */
async function handleGET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const [alcadas, historico, setores] = await Promise.all([
      listarAlcadas(),
      listarHistoricoAlcadas(50),
      listarSetoresConhecidos(),
    ]);
    return NextResponse.json({ ok: true, data: { alcadas, historico, setores } });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao listar as alçadas:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível listar as alçadas." }, { status: 500 });
  }
}

export const GET = comMetricasApi("admin/aprovacoes/alcadas", handleGET);

async function handlePOST(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const alcada = await salvarAlcada(lerCorpoAlcada(await request.json()), acesso.usuario);
    return NextResponse.json({ ok: true, message: "Alçada criada.", data: alcada }, { status: 201 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao criar a alçada:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível criar a alçada." }, { status: 500 });
  }
}

export const POST = comMetricasApi("admin/aprovacoes/alcadas", handlePOST);
