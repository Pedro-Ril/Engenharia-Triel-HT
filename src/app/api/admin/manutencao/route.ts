import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import {
  ativarManutencao,
  buscarStatusManutencao,
  desativarManutencao,
} from "@/lib/auth/manutencao";
import { isObject, optionalBoolean, optionalText } from "@/lib/auth/validation";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const status = await buscarStatusManutencao();
    return NextResponse.json({ ok: true, data: status });
  } catch (error) {
    console.error("Erro ao buscar status de manutenção:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível buscar o status de manutenção." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/manutencao", handleGET);

interface AtualizarManutencaoBody {
  ativo?: unknown;
  mensagem?: unknown;
}

async function handlePATCH(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  let body: AtualizarManutencaoBody;

  try {
    const parsedBody: unknown = await request.json();
    if (!isObject(parsedBody)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }
    body = parsedBody;
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { ok: false, message: "O corpo da requisição contém um JSON inválido." },
      { status: 400 }
    );
  }

  try {
    const ativo = optionalBoolean(body.ativo, "ativo", true);

    if (!ativo) {
      const status = await desativarManutencao();
      return NextResponse.json({ ok: true, message: "Manutenção desativada.", data: status });
    }

    const mensagem = optionalText(body.mensagem, "mensagem", 1000);

    const status = await ativarManutencao({
      mensagem,
      ativadoPor: acesso.usuario.samAccountName,
      ativadoPorId: acesso.usuario.id,
    });

    return NextResponse.json({
      ok: true,
      message: "Manutenção ativada. As sessões dos demais usuários foram encerradas.",
      data: status,
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao atualizar status de manutenção:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível atualizar o status de manutenção." },
      { status: 500 }
    );
  }
}

export const PATCH = comMetricasApi("admin/manutencao", handlePATCH);
