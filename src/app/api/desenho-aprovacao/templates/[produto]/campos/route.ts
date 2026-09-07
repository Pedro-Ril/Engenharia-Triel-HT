import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { listarCamposExtraDoProduto } from "@/lib/desenho-aprovacao/templates";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ produto: string }>;
}

async function handleGET(request: Request, context: RouteContext) {
  const acesso = await verificarAcessoModuloApi("desenho-aprovacao");
  if (acesso.negado) return acesso.negado;

  const { produto } = await context.params;
  const produtoDecodificado = decodeURIComponent(produto);
  const modelo = new URL(request.url).searchParams.get("modelo");

  try {
    const campos = await listarCamposExtraDoProduto(produtoDecodificado, modelo);
    return NextResponse.json({ ok: true, data: campos });
  } catch (error) {
    console.error("Erro ao listar campos extras do produto:", error);

    return NextResponse.json(
      { ok: false, message: "Não foi possível carregar os campos extras deste produto." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("desenho-aprovacao/templates/[produto]/campos", handleGET);
