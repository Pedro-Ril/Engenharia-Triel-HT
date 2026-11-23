import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalText, requiredText } from "@/lib/auth/validation";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { criarDestinatario, ehAmbiente, listarDestinatarios } from "@/lib/plugins-3dx/plugins-3dx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uniqueIdentifierPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handleGET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    return NextResponse.json({ ok: true, data: await listarDestinatarios() });
  } catch (error) {
    console.error("Erro ao listar destinatários dos Plugins 3DX:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível carregar os destinatários." }, { status: 500 });
  }
}

async function handlePOST(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const body: unknown = await request.json().catch(() => null);
    if (!isObject(body)) throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    const usuarioId = optionalText(body.usuarioId, "usuário", 36);
    if (usuarioId && !uniqueIdentifierPattern.test(usuarioId)) throw new ValidationError("Usuário inválido.");
    /* null/ausente = recebe dos dois ambientes */
    if (body.ambiente != null && !ehAmbiente(body.ambiente)) throw new ValidationError("Ambiente inválido.");

    await criarDestinatario(
      {
        pluginChave: requiredText(body.pluginChave, "plugin", 40),
        evento: requiredText(body.evento, "evento", 40),
        ambiente: ehAmbiente(body.ambiente) ? body.ambiente : null,
        usuarioId: usuarioId || null,
        email: optionalText(body.email, "e-mail", 320),
        nome: optionalText(body.nome, "nome", 200),
      },
      acesso.usuario
    );
    return NextResponse.json({ ok: true, message: "Destinatário adicionado." });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    console.error("Erro ao adicionar destinatário dos Plugins 3DX:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível adicionar." }, { status: 500 });
  }
}

export const GET = comMetricasApi("admin/plugins-3dx/destinatarios", handleGET);
export const POST = comMetricasApi("admin/plugins-3dx/destinatarios", handlePOST);
