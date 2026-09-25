import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, requiredText } from "@/lib/auth/validation";
import {
  concederAtendenteAprovacao,
  listarAtendentesAprovacoes,
  revogarAtendenteAprovacao,
} from "@/lib/aprovacoes/atendentes";
import { ehTipoAprovacao } from "@/lib/aprovacoes/tipos-aprovacao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const atendentes = await listarAtendentesAprovacoes();
    return NextResponse.json({ ok: true, data: atendentes });
  } catch (error) {
    console.error("Erro ao listar aprovadores:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar os aprovadores." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/aprovacoes/atendentes", handleGET);

async function handlePOST(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const body: unknown = await request.json();
    if (!isObject(body)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }

    const usuarioId = requiredText(body.usuarioId, "usuarioId", 36);
    const tipo = requiredText(body.tipo, "tipo", 40);

    if (!ehTipoAprovacao(tipo)) {
      throw new ValidationError("Tipo de aprovação inválido.");
    }

    const atendente = await concederAtendenteAprovacao({ usuarioId, tipo });

    return NextResponse.json(
      { ok: true, message: "Aprovador cadastrado.", data: atendente },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao cadastrar aprovador:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível cadastrar o aprovador." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("admin/aprovacoes/atendentes", handlePOST);

/* Remoção pelo par usuário+tipo (a tela é um sim/não, não uma lista de linhas). */
async function handleDELETE(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const parametros = new URL(request.url).searchParams;
  const usuarioId = parametros.get("usuarioId");
  const tipo = parametros.get("tipo");

  if (!usuarioId || !tipo || !ehTipoAprovacao(tipo)) {
    return NextResponse.json(
      { ok: false, message: "Informe usuarioId e um tipo de aprovação válido." },
      { status: 400 }
    );
  }

  try {
    await revogarAtendenteAprovacao(usuarioId, tipo);
    return NextResponse.json({ ok: true, message: "Aprovador removido." });
  } catch (error) {
    console.error("Erro ao remover aprovador:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível remover o aprovador." },
      { status: 500 }
    );
  }
}

export const DELETE = comMetricasApi("admin/aprovacoes/atendentes", handleDELETE);
