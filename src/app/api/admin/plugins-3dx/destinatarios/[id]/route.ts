import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject } from "@/lib/auth/validation";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { atualizarDestinatario, removerDestinatario } from "@/lib/plugins-3dx/plugins-3dx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uniqueIdentifierPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Contexto {
  params: Promise<{ id: string }>;
}

async function handlePATCH(request: Request, contexto: Contexto) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { id } = await contexto.params;
  try {
    if (!uniqueIdentifierPattern.test(id)) throw new ValidationError("Identificador inválido.");
    const body: unknown = await request.json().catch(() => null);
    if (!isObject(body) || typeof body.ativo !== "boolean") throw new ValidationError("Informe ativo (true/false).");
    await atualizarDestinatario(id, body.ativo);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    console.error("Erro ao atualizar destinatário dos Plugins 3DX:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível atualizar." }, { status: 500 });
  }
}

async function handleDELETE(_request: Request, contexto: Contexto) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { id } = await contexto.params;
  if (!uniqueIdentifierPattern.test(id)) {
    return NextResponse.json({ ok: false, message: "Identificador inválido." }, { status: 400 });
  }
  try {
    await removerDestinatario(id);
    return NextResponse.json({ ok: true, message: "Destinatário removido." });
  } catch (error) {
    console.error("Erro ao remover destinatário dos Plugins 3DX:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível remover." }, { status: 500 });
  }
}

export const PATCH = comMetricasApi("admin/plugins-3dx/destinatarios/id", handlePATCH);
export const DELETE = comMetricasApi("admin/plugins-3dx/destinatarios/id", handleDELETE);
