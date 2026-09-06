import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalText } from "@/lib/auth/validation";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { atualizarTopico, excluirTopico } from "@/lib/wiki/wiki-topicos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

async function handlePATCH(request: Request, { params }: RouteParams) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { id } = await params;

  try {
    const parsedBody: unknown = await request.json().catch(() => ({}));
    const body = isObject(parsedBody) ? parsedBody : {};

    const nome = optionalText(body.nome, "nome do tópico", 150) ?? undefined;
    const icone =
      body.icone === undefined ? undefined : optionalText(body.icone, "ícone", 60);

    const topico = await atualizarTopico(id, { nome, icone });

    if (!topico) {
      return NextResponse.json(
        { ok: false, message: "Tópico não encontrado." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, message: "Tópico atualizado.", data: topico });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao atualizar tópico do wiki:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível atualizar o tópico." },
      { status: 500 }
    );
  }
}

export const PATCH = comMetricasApi("admin/wiki/topicos/[id]", handlePATCH);

async function handleDELETE(_request: Request, { params }: RouteParams) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { id } = await params;

  try {
    const excluido = await excluirTopico(id);

    if (!excluido) {
      return NextResponse.json(
        { ok: false, message: "Tópico não encontrado." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, message: "Tópico excluído." });
  } catch (error) {
    console.error("Erro ao excluir tópico do wiki:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível excluir o tópico." },
      { status: 500 }
    );
  }
}

export const DELETE = comMetricasApi("admin/wiki/topicos/[id]", handleDELETE);
