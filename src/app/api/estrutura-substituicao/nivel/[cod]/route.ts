import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { buscarEstruturaCompleta } from "@/lib/estrutura-substituicao/estrutura-substituicao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ cod: string }>;
}

async function handleGET(_request: Request, context: RouteContext) {
  const acesso = await verificarAcessoModuloApi("substituicao-estrutura");
  if (acesso.negado) return acesso.negado;

  const { cod } = await context.params;

  try {
    const estrutura = await buscarEstruturaCompleta(cod);

    if (estrutura.itens.length === 0) {
      return NextResponse.json(
        { ok: false, message: "Nenhum item filho encontrado para esse código pai." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, data: estrutura });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao buscar estrutura no ERP:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível buscar a estrutura." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("estrutura-substituicao/nivel/[cod]", handleGET);
