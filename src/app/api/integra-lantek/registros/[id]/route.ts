import { NextResponse } from "next/server";

import { verificarAcessoIntegraLantekApi } from "@/lib/integra-lantek/autorizacao-integra-lantek";
import { buscarEventoLantek } from "@/lib/integra-lantek/eventos";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* Detalhe de um registro da Integra Lantek, com as linhas da exportação quando for o caso. */
async function handleGET(_request: Request, context: RouteContext) {
  const acesso = await verificarAcessoIntegraLantekApi();
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;
  if (!UUID.test(id)) {
    return NextResponse.json({ ok: false, message: "Registro inválido." }, { status: 400 });
  }

  try {
    const evento = await buscarEventoLantek(id);
    if (!evento) return NextResponse.json({ ok: false, message: "Registro não encontrado." }, { status: 404 });
    return NextResponse.json({ ok: true, data: evento });
  } catch (error) {
    console.error("Erro ao carregar o registro da Integra Lantek:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível carregar o registro." }, { status: 500 });
  }
}

export const GET = comMetricasApi("integra-lantek/registros/[id]", handleGET);
