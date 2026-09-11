import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject } from "@/lib/auth/validation";
import {
  definirUltimoNumeroGerado,
  obterUltimoNumeroGerado,
} from "@/lib/estoque-equipamentos-usados/estoque-equipamentos-usados";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const ultimoNumero = await obterUltimoNumeroGerado();
    return NextResponse.json({ ok: true, data: { ultimoNumero } });
  } catch (error) {
    console.error("Erro ao buscar a sequência de numeração do estoque:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível buscar a sequência de numeração." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/estoque-equipamentos-usados/sequencia", handleGET);

async function handlePATCH(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const parsedBody: unknown = await request.json();
    if (!isObject(parsedBody)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }

    if (typeof parsedBody.ultimoNumero !== "number") {
      throw new ValidationError("Informe um número válido.");
    }

    await definirUltimoNumeroGerado(parsedBody.ultimoNumero);
    const ultimoNumero = await obterUltimoNumeroGerado();

    return NextResponse.json({
      ok: true,
      message: "Sequência atualizada.",
      data: { ultimoNumero },
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao definir a sequência de numeração do estoque:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível atualizar a sequência de numeração." },
      { status: 500 }
    );
  }
}

export const PATCH = comMetricasApi("admin/estoque-equipamentos-usados/sequencia", handlePATCH);
