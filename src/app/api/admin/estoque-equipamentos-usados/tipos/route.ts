import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, requiredText } from "@/lib/auth/validation";
import {
  criarTipoEquipamento,
  listarTiposEquipamento,
} from "@/lib/estoque-equipamentos-usados/tipos-equipamento";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const tipos = await listarTiposEquipamento();
    return NextResponse.json({ ok: true, data: tipos });
  } catch (error) {
    console.error("Erro ao listar tipos de equipamento:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar os tipos de equipamento." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/estoque-equipamentos-usados/tipos", handleGET);

async function handlePOST(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const parsedBody: unknown = await request.json();
    if (!isObject(parsedBody)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }

    const nome = requiredText(parsedBody.nome, "nome", 150);
    const tipo = await criarTipoEquipamento(nome);

    return NextResponse.json(
      { ok: true, message: "Tipo de equipamento criado.", data: tipo },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao criar tipo de equipamento:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível criar o tipo de equipamento." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("admin/estoque-equipamentos-usados/tipos", handlePOST);
