import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalText, requiredText } from "@/lib/auth/validation";
import { criarEmpresa, listarEmpresas } from "@/lib/empresas/empresas";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const empresas = await listarEmpresas();
    return NextResponse.json({ ok: true, data: empresas });
  } catch (error) {
    console.error("Erro ao listar empresas:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar as empresas." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/empresas", handleGET);

async function handlePOST(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const parsedBody: unknown = await request.json();
    if (!isObject(parsedBody)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }

    const nome = requiredText(parsedBody.nome, "nome", 150);
    const codigo = optionalText(parsedBody.codigo, "código", 30);
    const corPrimariaClara = requiredText(parsedBody.corPrimariaClara, "cor (modo claro)", 7);
    const corPrimariaEscura = requiredText(parsedBody.corPrimariaEscura, "cor (modo escuro)", 7);

    const empresa = await criarEmpresa({ nome, codigo, corPrimariaClara, corPrimariaEscura });

    return NextResponse.json(
      { ok: true, message: "Empresa criada.", data: empresa },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao criar empresa:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível criar a empresa." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("admin/empresas", handlePOST);
