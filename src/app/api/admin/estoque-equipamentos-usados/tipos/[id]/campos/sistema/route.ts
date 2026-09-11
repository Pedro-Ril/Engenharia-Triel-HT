import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, requiredText } from "@/lib/auth/validation";
import { restaurarCampoSistema } from "@/lib/estoque-equipamentos-usados/tipos-equipamento";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function handlePOST(request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  try {
    const parsedBody: unknown = await request.json();
    if (!isObject(parsedBody)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }

    const chave = requiredText(parsedBody.chave, "chave", 60);
    const campo = await restaurarCampoSistema(id, chave);

    return NextResponse.json({ ok: true, message: "Campo restaurado.", data: campo }, { status: 201 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao restaurar campo do sistema:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível restaurar o campo." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi(
  "admin/estoque-equipamentos-usados/tipos/[id]/campos/sistema",
  handlePOST
);
