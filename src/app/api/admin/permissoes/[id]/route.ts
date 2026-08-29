import { NextResponse } from "next/server";

import { revogarPermissao } from "@/lib/auth/admin";
import { requireAdminApi } from "@/lib/auth/autorizacao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uniqueIdentifierPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function handleDELETE(_request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  if (!uniqueIdentifierPattern.test(id)) {
    return NextResponse.json(
      { ok: false, message: "O identificador da permissão é inválido." },
      { status: 400 }
    );
  }

  try {
    const removido = await revogarPermissao(id);

    if (!removido) {
      return NextResponse.json(
        { ok: false, message: "Permissão não encontrada." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, message: "Acesso revogado." });
  } catch (error) {
    console.error("Erro ao revogar permissão:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível revogar o acesso." },
      { status: 500 }
    );
  }
}

export const DELETE = comMetricasApi("admin/permissoes/[id]", handleDELETE);
