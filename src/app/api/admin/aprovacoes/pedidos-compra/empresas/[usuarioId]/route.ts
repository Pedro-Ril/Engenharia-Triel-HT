import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, requiredUuidArray } from "@/lib/auth/validation";
import { definirEmpresasAprovador } from "@/lib/aprovacoes/pedidos-compra-admin";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ usuarioId: string }>;
};

/* Substitui as empresas que o diretor aprova pelas marcadas na tela. */
async function handlePUT(request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const { usuarioId } = await context.params;
    const body: unknown = await request.json();

    if (!isObject(body) || !Array.isArray(body.empresas)) {
      throw new ValidationError("Informe a lista de empresas.");
    }

    const escopo = await definirEmpresasAprovador({
      usuarioId: requiredUuidArray([usuarioId], "usuarioId")[0],
      empresas: body.empresas.map((empresa) => Number(empresa)),
      alteradoPor: acesso.usuario.nomeExibicao,
    });

    return NextResponse.json({ ok: true, message: "Empresas salvas.", data: escopo });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao salvar as empresas do diretor:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível salvar as empresas do diretor." },
      { status: 500 }
    );
  }
}

export const PUT = comMetricasApi("admin/aprovacoes/pedidos-compra/empresas/[usuarioId]", handlePUT);
