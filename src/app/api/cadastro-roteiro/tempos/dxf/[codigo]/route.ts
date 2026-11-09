import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { lerDxfDoItem } from "@/lib/tempos-maquina/roteiro";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ codigo: string }>;
}

/* Geometria do DXF do item (pasta da Triel-HT); data null = não achou o arquivo. */
async function handleGET(_request: Request, context: RouteContext) {
  const acesso = await verificarAcessoModuloApi("cadastro-roteiro");
  if (acesso.negado) return acesso.negado;

  const { codigo } = await context.params;

  try {
    const dxf = await lerDxfDoItem(codigo);
    return NextResponse.json({
      ok: true,
      data: dxf ? { arquivo: dxf.arquivo, caminho: dxf.caminho, leitura: dxf.leitura } : null,
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    console.error("Erro ao ler o DXF do item:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível ler o DXF do item." }, { status: 500 });
  }
}

export const GET = comMetricasApi("cadastro-roteiro/tempos/dxf/[codigo]", handleGET);
