import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, requiredText } from "@/lib/auth/validation";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import {
  concederImpressao,
  listarPermissoesImpressao,
  revogarImpressao,
} from "@/lib/terminal-fabrica/impressao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const permissoes = await listarPermissoesImpressao();
    return NextResponse.json({ ok: true, data: permissoes });
  } catch (error) {
    console.error("Erro ao listar permissões de impressão do terminal:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar as permissões de impressão." },
      { status: 500 }
    );
  }
}

async function handlePOST(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const body: unknown = await request.json();
    if (!isObject(body)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }

    const usuarioId = requiredText(body.usuarioId, "usuário", 36);

    const permissao = await concederImpressao({
      usuarioId,
      concedidoPor: acesso.usuario.nomeExibicao,
    });

    return NextResponse.json({ ok: true, data: permissao });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao liberar impressão no terminal:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível liberar a impressão." },
      { status: 500 }
    );
  }
}

async function handleDELETE(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const usuarioId = new URL(request.url).searchParams.get("usuarioId");

    if (!usuarioId) {
      throw new ValidationError("Informe o usuário cuja permissão será revogada.");
    }

    await revogarImpressao(usuarioId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao revogar impressão no terminal:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível revogar a permissão." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/terminal-fabrica/impressao-permissoes", handleGET);
export const POST = comMetricasApi("admin/terminal-fabrica/impressao-permissoes", handlePOST);
export const DELETE = comMetricasApi(
  "admin/terminal-fabrica/impressao-permissoes",
  handleDELETE
);
