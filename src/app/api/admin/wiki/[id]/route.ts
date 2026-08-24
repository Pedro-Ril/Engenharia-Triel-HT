import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalBoolean, optionalText } from "@/lib/auth/validation";
import { atualizarArtigo, excluirArtigo } from "@/lib/wiki/wiki";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { id } = await params;

  try {
    const parsedBody: unknown = await request.json().catch(() => ({}));
    const body = isObject(parsedBody) ? parsedBody : {};

    const titulo = optionalText(body.titulo, "título", 200) ?? undefined;
    const conteudo = optionalText(body.conteudo, "conteúdo", 1_000_000) ?? undefined;
    const moduloId =
      body.moduloId === undefined ? undefined : optionalText(body.moduloId, "moduloId", 36);
    const privadoAdmin =
      body.privadoAdmin === undefined
        ? undefined
        : optionalBoolean(body.privadoAdmin, "privadoAdmin", false);
    const ativo =
      body.ativo === undefined ? undefined : optionalBoolean(body.ativo, "ativo", true);
    const ordem = typeof body.ordem === "number" ? body.ordem : undefined;

    const artigo = await atualizarArtigo(id, {
      titulo,
      conteudo,
      moduloId,
      privadoAdmin,
      ativo,
      ordem,
    });

    if (!artigo) {
      return NextResponse.json(
        { ok: false, message: "Artigo não encontrado." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, message: "Artigo atualizado.", data: artigo });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao atualizar artigo do wiki:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível atualizar o artigo." },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { id } = await params;

  try {
    const excluido = await excluirArtigo(id);

    if (!excluido) {
      return NextResponse.json(
        { ok: false, message: "Artigo não encontrado." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, message: "Artigo excluído." });
  } catch (error) {
    console.error("Erro ao excluir artigo do wiki:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível excluir o artigo." },
      { status: 500 }
    );
  }
}
