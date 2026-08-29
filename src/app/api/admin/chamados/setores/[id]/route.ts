import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalBoolean } from "@/lib/auth/validation";
import { atualizarAceiteChamadosSetor } from "@/lib/chamados/atendentes";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uniqueIdentifierPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function handlePATCH(request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  if (!uniqueIdentifierPattern.test(id)) {
    return NextResponse.json(
      { ok: false, message: "O identificador do setor é inválido." },
      { status: 400 }
    );
  }

  try {
    const parsedBody: unknown = await request.json();
    if (!isObject(parsedBody)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }

    const aceitaChamados = optionalBoolean(parsedBody.aceitaChamados, "aceitaChamados", false);

    const atualizado = await atualizarAceiteChamadosSetor(id, aceitaChamados);

    if (!atualizado) {
      return NextResponse.json(
        { ok: false, message: "Setor não encontrado." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, message: "Setor atualizado." });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao atualizar aceite de chamados do setor:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível atualizar o setor." },
      { status: 500 }
    );
  }
}

export const PATCH = comMetricasApi("admin/chamados/setores/[id]", handlePATCH);
