import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalInteger, requiredText } from "@/lib/auth/validation";
import { buscarConfigMateriaPrima, salvarConfigMateriaPrima } from "@/lib/materias-primas/materias-primas";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const config = await buscarConfigMateriaPrima();
    return NextResponse.json({ ok: true, data: config });
  } catch (error) {
    console.error("Erro ao buscar configuração de matéria-prima:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível buscar a configuração." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/materias-primas/config", handleGET);

interface UpdateConfigBody {
  apiBaseUrl?: unknown;
  intervaloSincronizacaoMinutos?: unknown;
}

async function handlePATCH(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  let body: UpdateConfigBody;

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
    const apiBaseUrl = requiredText(body.apiBaseUrl, "URL base da API", 300);
    const intervaloSincronizacaoMinutos = optionalInteger(
      body.intervaloSincronizacaoMinutos,
      "intervalo de sincronização",
      0
    );

    if (!/^https?:\/\//i.test(apiBaseUrl)) {
      throw new ValidationError('A URL base da API deve começar com "http://" ou "https://".');
    }

    if (intervaloSincronizacaoMinutos < 0) {
      throw new ValidationError("O intervalo de sincronização não pode ser negativo.");
    }

    const config = await salvarConfigMateriaPrima({
      apiBaseUrl: apiBaseUrl.replace(/\/+$/, ""),
      intervaloSincronizacaoMinutos: intervaloSincronizacaoMinutos || null,
      atualizadoPor: acesso.usuario.samAccountName,
    });

    return NextResponse.json({ ok: true, message: "Configuração salva.", data: config });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao salvar configuração de matéria-prima:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível salvar a configuração." },
      { status: 500 }
    );
  }
}

export const PATCH = comMetricasApi("admin/materias-primas/config", handlePATCH);
