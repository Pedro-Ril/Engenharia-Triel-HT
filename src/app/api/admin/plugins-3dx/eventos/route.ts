import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { ehAmbiente, listarAvisosRecentes } from "@/lib/plugins-3dx/plugins-3dx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Avisos e erros do log técnico dos nós, paginados: GET ?pagina=&ambiente=&nivel=aviso|erro */
async function handleGET(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const url = new URL(request.url);
  const ambiente = url.searchParams.get("ambiente");
  const nivel = url.searchParams.get("nivel");
  const pagina = Number(url.searchParams.get("pagina") ?? "1");

  try {
    const resultado = await listarAvisosRecentes({
      ambiente: ehAmbiente(ambiente) ? ambiente : null,
      nivel: nivel === "aviso" || nivel === "erro" ? nivel : null,
      pagina: Number.isInteger(pagina) && pagina > 0 ? pagina : 1,
    });
    return NextResponse.json({ ok: true, data: resultado });
  } catch (error) {
    console.error("Erro ao listar avisos dos Plugins 3DX:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível carregar os avisos." }, { status: 500 });
  }
}

export const GET = comMetricasApi("admin/plugins-3dx/eventos", handleGET);
