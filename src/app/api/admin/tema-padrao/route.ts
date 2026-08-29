import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, requiredText } from "@/lib/auth/validation";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { buscarTemaPadrao, removerTemaPadrao, salvarTemaPadrao } from "@/lib/tema/tema-padrao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const temaPadrao = await buscarTemaPadrao();
    return NextResponse.json({ ok: true, data: temaPadrao });
  } catch (error) {
    console.error("Erro ao buscar tema padrão:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível buscar o tema padrão." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/tema-padrao", handleGET);

async function handlePATCH(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const parsedBody: unknown = await request.json();
    if (!isObject(parsedBody)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }

    const corPrimariaClara = requiredText(parsedBody.corPrimariaClara, "cor (modo claro)", 7);
    const corPrimariaEscura = requiredText(parsedBody.corPrimariaEscura, "cor (modo escuro)", 7);

    const temaPadrao = await salvarTemaPadrao({
      corPrimariaClara,
      corPrimariaEscura,
      atualizadoPor: acesso.usuario.samAccountName,
    });

    return NextResponse.json({ ok: true, message: "Tema padrão atualizado.", data: temaPadrao });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao salvar tema padrão:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível salvar o tema padrão." },
      { status: 500 }
    );
  }
}

export const PATCH = comMetricasApi("admin/tema-padrao", handlePATCH);

async function handleDELETE() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    await removerTemaPadrao();
    return NextResponse.json({ ok: true, message: "Tema padrão restaurado para o vermelho original." });
  } catch (error) {
    console.error("Erro ao remover tema padrão:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível restaurar o tema padrão." },
      { status: 500 }
    );
  }
}

export const DELETE = comMetricasApi("admin/tema-padrao", handleDELETE);
