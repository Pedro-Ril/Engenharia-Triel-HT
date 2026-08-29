import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalText, requiredText } from "@/lib/auth/validation";
import { atualizarEmpresa } from "@/lib/empresas/empresas";
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
      { ok: false, message: "O identificador da empresa é inválido." },
      { status: 400 }
    );
  }

  try {
    const parsedBody: unknown = await request.json();
    if (!isObject(parsedBody)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }

    if (parsedBody.ativa !== undefined && typeof parsedBody.ativa !== "boolean") {
      throw new ValidationError("O campo ativa deve ser verdadeiro ou falso.");
    }

    const empresa = await atualizarEmpresa(id, {
      nome: parsedBody.nome !== undefined ? requiredText(parsedBody.nome, "nome", 150) : undefined,
      codigo:
        parsedBody.codigo !== undefined ? optionalText(parsedBody.codigo, "código", 30) : undefined,
      corPrimariaClara:
        parsedBody.corPrimariaClara !== undefined
          ? requiredText(parsedBody.corPrimariaClara, "cor (modo claro)", 7)
          : undefined,
      corPrimariaEscura:
        parsedBody.corPrimariaEscura !== undefined
          ? requiredText(parsedBody.corPrimariaEscura, "cor (modo escuro)", 7)
          : undefined,
      ativa: parsedBody.ativa as boolean | undefined,
    });

    return NextResponse.json({ ok: true, message: "Empresa atualizada.", data: empresa });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao atualizar empresa:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível atualizar a empresa." },
      { status: 500 }
    );
  }
}

export const PATCH = comMetricasApi("admin/empresas/[id]", handlePATCH);
