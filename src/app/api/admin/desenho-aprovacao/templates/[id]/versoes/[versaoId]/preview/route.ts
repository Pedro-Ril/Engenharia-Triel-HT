import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject } from "@/lib/auth/validation";
import { renderizarPreviaVersao } from "@/lib/desenho-aprovacao/templates";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uniqueIdentifierPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteContext {
  params: Promise<{ id: string; versaoId: string }>;
}

interface PreviewBody {
  dadosExemplo?: unknown;
}

async function handlePOST(request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { versaoId } = await context.params;

  if (!uniqueIdentifierPattern.test(versaoId)) {
    return NextResponse.json({ ok: false, message: "O identificador da versão é inválido." }, { status: 400 });
  }

  let body: PreviewBody = {};

  try {
    const parsedBody: unknown = await request.json();

    if (isObject(parsedBody)) {
      body = parsedBody;
    }
  } catch {
    /* dadosExemplo é opcional — sem ele, campos ficam vazios/valorPadrao. */
  }

  const dadosExemplo = isObject(body.dadosExemplo) ? body.dadosExemplo : {};

  try {
    const svg = await renderizarPreviaVersao(versaoId, dadosExemplo);
    return NextResponse.json({ ok: true, data: { svg } });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao gerar prévia de template:", error);

    return NextResponse.json({ ok: false, message: "Não foi possível gerar a prévia." }, { status: 500 });
  }
}

export const POST = comMetricasApi(
  "admin/desenho-aprovacao/templates/[id]/versoes/[versaoId]/preview",
  handlePOST
);
