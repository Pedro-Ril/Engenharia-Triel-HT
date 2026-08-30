import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { revogarTerminal } from "@/lib/tv/terminais";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uniqueIdentifierPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function handlePOST(_request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  if (!uniqueIdentifierPattern.test(id)) {
    return NextResponse.json(
      { ok: false, message: "O identificador do terminal é inválido." },
      { status: 400 }
    );
  }

  try {
    const revogado = await revogarTerminal(id);

    if (!revogado) {
      return NextResponse.json(
        { ok: false, message: "Terminal não encontrado." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Sessão do terminal revogada — ele vai precisar ser pareado de novo.",
    });
  } catch (error) {
    console.error("Erro ao revogar terminal de TV:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível revogar o terminal." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("admin/tv/terminais/[id]/revogar", handlePOST);
