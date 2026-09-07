import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { publicarVersao } from "@/lib/desenho-aprovacao/templates";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uniqueIdentifierPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteContext {
  params: Promise<{ id: string; versaoId: string }>;
}

async function handlePOST(_request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { versaoId } = await context.params;

  if (!uniqueIdentifierPattern.test(versaoId)) {
    return NextResponse.json({ ok: false, message: "O identificador da versão é inválido." }, { status: 400 });
  }

  try {
    const versao = await publicarVersao(versaoId, acesso.usuario.samAccountName);
    return NextResponse.json({ ok: true, message: "Versão publicada.", data: versao });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 409 });
    }

    console.error("Erro ao publicar versão de template:", error);

    return NextResponse.json({ ok: false, message: "Não foi possível publicar a versão." }, { status: 500 });
  }
}

export const POST = comMetricasApi(
  "admin/desenho-aprovacao/templates/[id]/versoes/[versaoId]/publicar",
  handlePOST
);
