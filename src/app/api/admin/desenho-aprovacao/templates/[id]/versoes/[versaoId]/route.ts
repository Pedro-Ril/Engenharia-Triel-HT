import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { buscarVersaoPorId, salvarRascunho } from "@/lib/desenho-aprovacao/templates";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uniqueIdentifierPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteContext {
  params: Promise<{ id: string; versaoId: string }>;
}

async function handleGET(_request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { versaoId } = await context.params;

  if (!uniqueIdentifierPattern.test(versaoId)) {
    return NextResponse.json({ ok: false, message: "O identificador da versão é inválido." }, { status: 400 });
  }

  try {
    const versao = await buscarVersaoPorId(versaoId);

    if (!versao) {
      return NextResponse.json({ ok: false, message: "Versão não encontrada." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data: versao });
  } catch (error) {
    console.error("Erro ao buscar versão de template:", error);

    return NextResponse.json({ ok: false, message: "Não foi possível buscar a versão." }, { status: 500 });
  }
}

export const GET = comMetricasApi("admin/desenho-aprovacao/templates/[id]/versoes/[versaoId]", handleGET);

async function handlePUT(request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { versaoId } = await context.params;

  if (!uniqueIdentifierPattern.test(versaoId)) {
    return NextResponse.json({ ok: false, message: "O identificador da versão é inválido." }, { status: 400 });
  }

  let templateJson: unknown;

  try {
    templateJson = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "O corpo da requisição contém um JSON inválido." },
      { status: 400 }
    );
  }

  try {
    const versao = await salvarRascunho(versaoId, templateJson, acesso.usuario.samAccountName);
    return NextResponse.json({ ok: true, message: "Rascunho salvo.", data: versao });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao salvar rascunho de template:", error);

    return NextResponse.json({ ok: false, message: "Não foi possível salvar o rascunho." }, { status: 500 });
  }
}

export const PUT = comMetricasApi("admin/desenho-aprovacao/templates/[id]/versoes/[versaoId]", handlePUT);
