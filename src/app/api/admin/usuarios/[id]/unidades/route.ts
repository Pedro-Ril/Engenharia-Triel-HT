import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject } from "@/lib/auth/validation";
import { definirUnidadesDoUsuario } from "@/lib/empresas/unidades";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uniqueIdentifierPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteContext {
  params: Promise<{ id: string }>;
}

/* Substitui o conjunto inteiro de unidades do usuário ([] = nenhuma). */
async function handlePUT(request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  if (!uniqueIdentifierPattern.test(id)) {
    return NextResponse.json(
      { ok: false, message: "O identificador do usuário é inválido." },
      { status: 400 }
    );
  }

  try {
    const corpo: unknown = await request.json();
    if (!isObject(corpo) || !Array.isArray(corpo.unidadeIds)) {
      throw new ValidationError("Informe a lista de unidades (unidadeIds).");
    }

    const unidadeIds = corpo.unidadeIds;
    if (
      unidadeIds.length > 100 ||
      unidadeIds.some((item) => typeof item !== "string" || !uniqueIdentifierPattern.test(item))
    ) {
      throw new ValidationError("A lista de unidades contém um valor inválido.");
    }

    const salvas = await definirUnidadesDoUsuario(id, unidadeIds as string[]);

    return NextResponse.json({
      ok: true,
      message: "Unidades do usuário atualizadas.",
      data: salvas,
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao salvar unidades do usuário:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível salvar as unidades do usuário." },
      { status: 500 }
    );
  }
}

export const PUT = comMetricasApi("admin/usuarios/[id]/unidades", handlePUT);
