import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalBoolean, optionalText, requiredText } from "@/lib/auth/validation";
import { criarArtigo, listarArtigosAdmin } from "@/lib/wiki/wiki";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const artigos = await listarArtigosAdmin();
    return NextResponse.json({ ok: true, data: artigos });
  } catch (error) {
    console.error("Erro ao listar artigos do wiki:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível carregar os artigos." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const parsedBody: unknown = await request.json().catch(() => ({}));
    const body = isObject(parsedBody) ? parsedBody : {};

    const titulo = requiredText(body.titulo, "título", 200);
    const conteudo = requiredText(body.conteudo, "conteúdo", 1_000_000);
    const moduloId = optionalText(body.moduloId, "moduloId", 36);
    const privadoAdmin = optionalBoolean(body.privadoAdmin, "privadoAdmin", false);
    const ativo = optionalBoolean(body.ativo, "ativo", true);

    const artigo = await criarArtigo({
      titulo,
      conteudo,
      moduloId,
      privadoAdmin,
      ativo,
      autorUsuarioId: acesso.usuario.id,
    });

    return NextResponse.json(
      { ok: true, message: "Artigo criado.", data: artigo },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao criar artigo do wiki:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível criar o artigo." },
      { status: 500 }
    );
  }
}
