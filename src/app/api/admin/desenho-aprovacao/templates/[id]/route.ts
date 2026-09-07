import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalText } from "@/lib/auth/validation";
import { atualizarTemplate, buscarTemplatePorId } from "@/lib/desenho-aprovacao/templates";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uniqueIdentifierPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS_VALIDOS = ["ativo", "arquivado"];

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface UpdateTemplateBody {
  nome?: unknown;
  descricao?: unknown;
  status?: unknown;
}

async function handleGET(_request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  if (!uniqueIdentifierPattern.test(id)) {
    return NextResponse.json({ ok: false, message: "O identificador do template é inválido." }, { status: 400 });
  }

  try {
    const template = await buscarTemplatePorId(id);

    if (!template) {
      return NextResponse.json({ ok: false, message: "Template não encontrado." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data: template });
  } catch (error) {
    console.error("Erro ao buscar template de desenho de aprovação:", error);

    return NextResponse.json({ ok: false, message: "Não foi possível buscar o template." }, { status: 500 });
  }
}

export const GET = comMetricasApi("admin/desenho-aprovacao/templates/[id]", handleGET);

async function handlePATCH(request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  if (!uniqueIdentifierPattern.test(id)) {
    return NextResponse.json({ ok: false, message: "O identificador do template é inválido." }, { status: 400 });
  }

  let body: UpdateTemplateBody;

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
    const nome = body.nome === undefined ? undefined : optionalText(body.nome, "nome", 400) ?? undefined;
    const descricao = body.descricao === undefined ? undefined : optionalText(body.descricao, "descricao", 2000);

    let status: "ativo" | "arquivado" | undefined;

    if (body.status !== undefined) {
      if (typeof body.status !== "string" || !STATUS_VALIDOS.includes(body.status)) {
        throw new ValidationError('O campo status deve ser "ativo" ou "arquivado".');
      }

      status = body.status as "ativo" | "arquivado";
    }

    const template = await atualizarTemplate(id, { nome, descricao, status }, acesso.usuario.samAccountName);

    if (!template) {
      return NextResponse.json({ ok: false, message: "Template não encontrado." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, message: "Template atualizado.", data: template });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao atualizar template de desenho de aprovação:", error);

    return NextResponse.json({ ok: false, message: "Não foi possível atualizar o template." }, { status: 500 });
  }
}

export const PATCH = comMetricasApi("admin/desenho-aprovacao/templates/[id]", handlePATCH);
