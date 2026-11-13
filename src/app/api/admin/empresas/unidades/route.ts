import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, requiredText } from "@/lib/auth/validation";
import { criarUnidade, listarUnidades } from "@/lib/empresas/unidades";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uniqueIdentifierPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handleGET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    return NextResponse.json({ ok: true, data: await listarUnidades() });
  } catch (error) {
    console.error("Erro ao listar unidades:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar as unidades." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/empresas/unidades", handleGET);

async function handlePOST(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const corpo: unknown = await request.json();
    if (!isObject(corpo)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }

    const empresaId = requiredText(corpo.empresaId, "empresa", 36);
    if (!uniqueIdentifierPattern.test(empresaId)) {
      throw new ValidationError("O identificador da empresa é inválido.");
    }

    const unidade = await criarUnidade(empresaId, requiredText(corpo.nome, "nome", 100));

    return NextResponse.json(
      { ok: true, message: "Unidade criada.", data: unidade },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao criar unidade:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível criar a unidade." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("admin/empresas/unidades", handlePOST);
