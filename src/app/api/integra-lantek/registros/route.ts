import { NextResponse } from "next/server";

import { verificarAcessoIntegraLantekApi } from "@/lib/integra-lantek/autorizacao-integra-lantek";
import { lerModuloLantek, listarEventosLantek } from "@/lib/integra-lantek/eventos";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Registros da Integra Lantek (pesquisa no ERP, busca de DXF, exportação) -- botão "Registros" da tela. */
async function handleGET(request: Request) {
  const acesso = await verificarAcessoIntegraLantekApi();
  if (acesso.negado) return acesso.negado;

  try {
    const { searchParams } = new URL(request.url);
    const pagina = Math.max(1, Number(searchParams.get("pagina")) || 1);
    const porPagina = Math.min(100, Math.max(5, Number(searchParams.get("porPagina")) || 20));
    const dados = await listarEventosLantek({
      modulo: lerModuloLantek(searchParams.get("modulo")),
      busca: (searchParams.get("busca") ?? "").slice(0, 100),
      pagina,
      porPagina,
    });
    return NextResponse.json({ ok: true, data: dados });
  } catch (error) {
    console.error("Erro ao listar os registros da Integra Lantek:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível carregar os registros." }, { status: 500 });
  }
}

export const GET = comMetricasApi("integra-lantek/registros", handleGET);
