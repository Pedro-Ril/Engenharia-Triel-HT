import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalBoolean, optionalInteger, optionalText, requiredText } from "@/lib/auth/validation";
import { criarVinculo, listarVinculosDoTemplate } from "@/lib/desenho-aprovacao/templates";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uniqueIdentifierPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface CreateVinculoBody {
  produto?: unknown;
  modelo?: unknown;
  padrao?: unknown;
  prioridade?: unknown;
  vigenciaInicio?: unknown;
  vigenciaFim?: unknown;
}

async function handleGET(_request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  if (!uniqueIdentifierPattern.test(id)) {
    return NextResponse.json({ ok: false, message: "O identificador do template é inválido." }, { status: 400 });
  }

  try {
    const vinculos = await listarVinculosDoTemplate(id);
    return NextResponse.json({ ok: true, data: vinculos });
  } catch (error) {
    console.error("Erro ao listar vínculos do template:", error);

    return NextResponse.json({ ok: false, message: "Não foi possível listar os vínculos." }, { status: 500 });
  }
}

export const GET = comMetricasApi("admin/desenho-aprovacao/templates/[id]/vinculos", handleGET);

async function handlePOST(request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  if (!uniqueIdentifierPattern.test(id)) {
    return NextResponse.json({ ok: false, message: "O identificador do template é inválido." }, { status: 400 });
  }

  let body: CreateVinculoBody;

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
    const produto = requiredText(body.produto, "produto", 300);
    const modelo = optionalText(body.modelo, "modelo", 300);
    const padrao = optionalBoolean(body.padrao, "padrao", false);
    const prioridade = optionalInteger(body.prioridade, "prioridade", 100);

    const vigenciaInicio =
      typeof body.vigenciaInicio === "string" && body.vigenciaInicio ? body.vigenciaInicio : null;

    const vigenciaFim = typeof body.vigenciaFim === "string" && body.vigenciaFim ? body.vigenciaFim : null;

    const vinculo = await criarVinculo(
      { templateId: id, produto, modelo, padrao, prioridade, vigenciaInicio, vigenciaFim },
      acesso.usuario.samAccountName
    );

    return NextResponse.json({ ok: true, message: "Vínculo criado.", data: vinculo }, { status: 201 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao criar vínculo de template:", error);

    return NextResponse.json({ ok: false, message: "Não foi possível criar o vínculo." }, { status: 500 });
  }
}

export const POST = comMetricasApi("admin/desenho-aprovacao/templates/[id]/vinculos", handlePOST);
