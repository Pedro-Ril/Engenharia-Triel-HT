import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import {
  isObject,
  optionalBoolean,
  optionalInteger,
  requiredText,
} from "@/lib/auth/validation";
import { atualizarTag, excluirTag } from "@/lib/atualizacoes/atualizacoes";
import { CORES_TAG_DISPONIVEIS } from "@/lib/atualizacoes/cores-tag";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uniqueIdentifierPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requiredCor(value: unknown, fieldName: string): string {
  const texto = requiredText(value, fieldName, 20);

  if (!(CORES_TAG_DISPONIVEIS as readonly string[]).includes(texto)) {
    throw new ValidationError(
      `O campo ${fieldName} deve ser uma das cores disponíveis.`
    );
  }

  return texto;
}

interface UpdateTagBody {
  nome?: unknown;
  cor?: unknown;
  ordem?: unknown;
  ativo?: unknown;
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function handlePATCH(request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  if (!uniqueIdentifierPattern.test(id)) {
    return NextResponse.json(
      { ok: false, message: "O identificador da tag é inválido." },
      { status: 400 }
    );
  }

  let body: UpdateTagBody;

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
    const nome = requiredText(body.nome, "nome", 100);
    const cor = requiredCor(body.cor, "cor");
    const ordem = optionalInteger(body.ordem, "ordem", 0);
    const ativo = optionalBoolean(body.ativo, "ativo", true);

    const tag = await atualizarTag(id, { nome, cor, ordem, ativo });

    if (!tag) {
      return NextResponse.json(
        { ok: false, message: "Tag não encontrada." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, message: "Tag atualizada.", data: tag });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao atualizar tag de atualização:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível atualizar a tag." },
      { status: 500 }
    );
  }
}

export const PATCH = comMetricasApi("admin/atualizacoes/tags/[id]", handlePATCH);

async function handleDELETE(_request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  if (!uniqueIdentifierPattern.test(id)) {
    return NextResponse.json(
      { ok: false, message: "O identificador da tag é inválido." },
      { status: 400 }
    );
  }

  try {
    const removido = await excluirTag(id);

    if (!removido) {
      return NextResponse.json(
        { ok: false, message: "Tag não encontrada." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, message: "Tag excluída." });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 409 });
    }

    console.error("Erro ao excluir tag de atualização:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível excluir a tag." },
      { status: 500 }
    );
  }
}

export const DELETE = comMetricasApi("admin/atualizacoes/tags/[id]", handleDELETE);
