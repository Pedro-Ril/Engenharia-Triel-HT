import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { excluirPastaMidia } from "@/lib/tv/midias";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uniqueIdentifierPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function handleDELETE(_request: Request, context: RouteContext) {
  const acesso = await verificarAcessoModuloApi("tv-corporativa");
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  if (!uniqueIdentifierPattern.test(id)) {
    return NextResponse.json(
      { ok: false, message: "O identificador da pasta é inválido." },
      { status: 400 }
    );
  }

  try {
    await excluirPastaMidia(id);
    return NextResponse.json({ ok: true, message: "Pasta excluída." });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao excluir pasta de mídia de TV:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível excluir a pasta." },
      { status: 500 }
    );
  }
}

export const DELETE = comMetricasApi("tv-corporativa/midias/pastas/[id]", handleDELETE);
