import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { revogarAtendente } from "@/lib/chamados/atendentes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uniqueIdentifierPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function DELETE(_request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  if (!uniqueIdentifierPattern.test(id)) {
    return NextResponse.json(
      { ok: false, message: "O identificador do atendente é inválido." },
      { status: 400 }
    );
  }

  try {
    const removido = await revogarAtendente(id);

    if (!removido) {
      return NextResponse.json(
        { ok: false, message: "Atendente não encontrado." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, message: "Atendente removido." });
  } catch (error) {
    console.error("Erro ao remover atendente de chamados:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível remover o atendente." },
      { status: 500 }
    );
  }
}
