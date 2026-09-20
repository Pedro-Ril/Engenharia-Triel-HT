import { NextResponse } from "next/server";

import { listarAssinaturasGeradas } from "@/lib/assinaturas/geradas";
import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Lista compartilhada -- todo usuário com acesso ao módulo vê todas as assinaturas geradas por qualquer pessoa, paginada e com busca (ver listarAssinaturasGeradas). */
async function handleGET(request: Request) {
  const acesso = await verificarAcessoModuloApi("assinaturas");
  if (acesso.negado) return acesso.negado;

  try {
    const params = new URL(request.url).searchParams;
    const pagina = Math.max(1, Number(params.get("pagina")) || 1);
    const porPagina = Math.min(100, Math.max(1, Number(params.get("porPagina")) || 20));
    const busca = params.get("busca") || undefined;

    const resultado = await listarAssinaturasGeradas(pagina, porPagina, busca);

    return NextResponse.json({ ok: true, data: resultado });
  } catch (error) {
    console.error("Erro ao listar assinaturas geradas:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível carregar as assinaturas." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("assinaturas/geradas", handleGET);
