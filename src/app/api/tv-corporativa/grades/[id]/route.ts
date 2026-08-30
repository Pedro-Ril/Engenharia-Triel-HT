import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalBoolean, requiredText } from "@/lib/auth/validation";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { atualizarGrade, buscarGradeComSlots, excluirGrade } from "@/lib/tv/grades";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uniqueIdentifierPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function handleGET(_request: Request, context: RouteContext) {
  const acesso = await verificarAcessoModuloApi("tv-corporativa");
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  if (!uniqueIdentifierPattern.test(id)) {
    return NextResponse.json(
      { ok: false, message: "O identificador da grade é inválido." },
      { status: 400 }
    );
  }

  try {
    const grade = await buscarGradeComSlots(id);

    if (!grade) {
      return NextResponse.json({ ok: false, message: "Grade não encontrada." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data: grade });
  } catch (error) {
    console.error("Erro ao buscar grade de TV:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível buscar a grade." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("tv-corporativa/grades/[id]", handleGET);

interface AtualizarGradeBody {
  nome?: unknown;
  ativa?: unknown;
}

async function handlePATCH(request: Request, context: RouteContext) {
  const acesso = await verificarAcessoModuloApi("tv-corporativa");
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  if (!uniqueIdentifierPattern.test(id)) {
    return NextResponse.json(
      { ok: false, message: "O identificador da grade é inválido." },
      { status: 400 }
    );
  }

  let body: AtualizarGradeBody;

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
    const nome = requiredText(body.nome, "nome", 150);
    const ativa = optionalBoolean(body.ativa, "ativa", true);

    const grade = await atualizarGrade(id, { nome, ativa });

    if (!grade) {
      return NextResponse.json({ ok: false, message: "Grade não encontrada." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, message: "Grade atualizada.", data: grade });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao atualizar grade de TV:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível atualizar a grade." },
      { status: 500 }
    );
  }
}

export const PATCH = comMetricasApi("tv-corporativa/grades/[id]", handlePATCH);

async function handleDELETE(_request: Request, context: RouteContext) {
  const acesso = await verificarAcessoModuloApi("tv-corporativa");
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  if (!uniqueIdentifierPattern.test(id)) {
    return NextResponse.json(
      { ok: false, message: "O identificador da grade é inválido." },
      { status: 400 }
    );
  }

  try {
    const removida = await excluirGrade(id);

    if (!removida) {
      return NextResponse.json({ ok: false, message: "Grade não encontrada." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, message: "Grade excluída." });
  } catch (error) {
    console.error("Erro ao excluir grade de TV:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível excluir a grade." },
      { status: 500 }
    );
  }
}

export const DELETE = comMetricasApi("tv-corporativa/grades/[id]", handleDELETE);
