import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { requiredUuidArray } from "@/lib/auth/validation";
import { buscarImagemRubrica, removerRubrica, salvarRubrica, TAMANHO_MAXIMO_RUBRICA } from "@/lib/aprovacoes/rubricas";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ usuarioId: string }>;
};

async function lerUsuarioId(context: RouteContext): Promise<string> {
  const { usuarioId } = await context.params;
  return requiredUuidArray([usuarioId], "usuário")[0];
}

/* Prévia da rubrica na administração. Só administrador vê a imagem solta. */
async function handleGET(_request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const imagem = await buscarImagemRubrica(await lerUsuarioId(context));
    if (!imagem) return NextResponse.json({ ok: false, message: "Sem rubrica cadastrada." }, { status: 404 });

    return new NextResponse(new Uint8Array(imagem), {
      status: 200,
      headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    console.error("Erro ao abrir a rubrica:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível abrir a rubrica." }, { status: 500 });
  }
}

export const GET = comMetricasApi("admin/aprovacoes/rubricas/[usuarioId]", handleGET);

/* Envia ou troca a rubrica (multipart, campo "arquivo", PNG). */
async function handlePUT(request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const usuarioId = await lerUsuarioId(context);
    const arquivo = (await request.formData()).get("arquivo");
    if (!(arquivo instanceof File)) throw new ValidationError('Envie a rubrica em PNG no campo "arquivo".');
    /* Recusa pelo tamanho antes de ler o arquivo para a memória. */
    if (arquivo.size > TAMANHO_MAXIMO_RUBRICA) {
      throw new ValidationError(`A rubrica pode ter no máximo ${TAMANHO_MAXIMO_RUBRICA / 1024} KB.`);
    }

    await salvarRubrica(usuarioId, new Uint8Array(await arquivo.arrayBuffer()), acesso.usuario);
    return NextResponse.json({ ok: true, message: "Rubrica salva." });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    console.error("Erro ao salvar a rubrica:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível salvar a rubrica." }, { status: 500 });
  }
}

export const PUT = comMetricasApi("admin/aprovacoes/rubricas/[usuarioId]", handlePUT);

async function handleDELETE(_request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    await removerRubrica(await lerUsuarioId(context), acesso.usuario);
    return NextResponse.json({ ok: true, message: "Rubrica removida." });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    console.error("Erro ao remover a rubrica:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível remover a rubrica." }, { status: 500 });
  }
}

export const DELETE = comMetricasApi("admin/aprovacoes/rubricas/[usuarioId]", handleDELETE);
