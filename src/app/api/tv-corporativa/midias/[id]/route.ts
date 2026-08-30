import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalText } from "@/lib/auth/validation";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { excluirMidia, moverMidiaParaPasta } from "@/lib/tv/midias";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uniqueIdentifierPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface AtualizarMidiaBody {
  pastaId?: unknown;
}

async function handlePATCH(request: Request, context: RouteContext) {
  const acesso = await verificarAcessoModuloApi("tv-corporativa");
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  if (!uniqueIdentifierPattern.test(id)) {
    return NextResponse.json(
      { ok: false, message: "O identificador da mídia é inválido." },
      { status: 400 }
    );
  }

  let body: AtualizarMidiaBody;

  try {
    const parsedBody: unknown = await request.json();
    if (!isObject(parsedBody)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }
    body = parsedBody;
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { ok: false, message: "O corpo da requisição contém um JSON inválido." },
      { status: 400 }
    );
  }

  try {
    const pastaId = optionalText(body.pastaId, "pastaId", 36);
    await moverMidiaParaPasta(id, pastaId);

    return NextResponse.json({ ok: true, message: "Mídia movida." });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao mover mídia de TV de pasta:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível mover a mídia." },
      { status: 500 }
    );
  }
}

export const PATCH = comMetricasApi("tv-corporativa/midias/[id]", handlePATCH);

async function handleDELETE(_request: Request, context: RouteContext) {
  const acesso = await verificarAcessoModuloApi("tv-corporativa");
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  if (!uniqueIdentifierPattern.test(id)) {
    return NextResponse.json(
      { ok: false, message: "O identificador da mídia é inválido." },
      { status: 400 }
    );
  }

  try {
    await excluirMidia(id);
    return NextResponse.json({ ok: true, message: "Mídia excluída." });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao excluir mídia de TV:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível excluir a mídia." },
      { status: 500 }
    );
  }
}

export const DELETE = comMetricasApi("tv-corporativa/midias/[id]", handleDELETE);
