import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject } from "@/lib/auth/validation";
import { concederAtendente, listarAtendentes } from "@/lib/chamados/atendentes";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uniqueIdentifierPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handleGET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const atendentes = await listarAtendentes();
    return NextResponse.json({ ok: true, data: atendentes });
  } catch (error) {
    console.error("Erro ao listar atendentes de chamados:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar os atendentes." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/chamados/atendentes", handleGET);

interface CreateAtendenteBody {
  usuarioId?: unknown;
  setorId?: unknown;
}

async function handlePOST(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  let body: CreateAtendenteBody;

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
    if (
      typeof body.usuarioId !== "string" ||
      !uniqueIdentifierPattern.test(body.usuarioId)
    ) {
      throw new ValidationError("Informe um usuário válido.");
    }

    if (typeof body.setorId !== "string" || !uniqueIdentifierPattern.test(body.setorId)) {
      throw new ValidationError("Informe um setor válido.");
    }

    const atendente = await concederAtendente({
      usuarioId: body.usuarioId,
      setorId: body.setorId,
    });

    return NextResponse.json(
      { ok: true, message: "Atendente adicionado.", data: atendente },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao adicionar atendente de chamados:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível adicionar o atendente." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("admin/chamados/atendentes", handlePOST);
