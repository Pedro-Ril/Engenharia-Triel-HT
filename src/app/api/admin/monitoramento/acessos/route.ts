import { NextResponse } from "next/server";

import { listarHistoricoAcessoModuloAdmin } from "@/lib/auth/acesso-modulo";
import { requireAdminApi } from "@/lib/auth/autorizacao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const url = new URL(request.url);
  const pagina = Math.max(1, Number(url.searchParams.get("pagina")) || 1);
  const porPagina = Math.min(50, Math.max(1, Number(url.searchParams.get("porPagina")) || 20));
  const busca = url.searchParams.get("busca") || undefined;
  const moduloChave = url.searchParams.get("moduloChave") || undefined;

  try {
    const { itens, total } = await listarHistoricoAcessoModuloAdmin(pagina, porPagina, {
      busca,
      moduloChave,
    });
    return NextResponse.json({ ok: true, data: { itens, total } });
  } catch (error) {
    console.error("Erro ao listar histórico de acessos a módulos:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível carregar o histórico de acessos." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/monitoramento/acessos", handleGET);
