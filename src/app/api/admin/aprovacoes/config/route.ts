import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalText } from "@/lib/auth/validation";
import {
  buscarConfigAprovacoes,
  salvarConfigAprovacoes,
  type ModoPainel,
} from "@/lib/aprovacoes/config";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    return NextResponse.json({ ok: true, data: await buscarConfigAprovacoes() });
  } catch (error) {
    console.error("Erro ao buscar configuração de aprovações:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível carregar a configuração." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/aprovacoes/config", handleGET);

async function handlePUT(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const body: unknown = await request.json();
    if (!isObject(body)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }

    const emailRelatorio = optionalText(body.emailRelatorio, "e-mail do relatório", 200);
    const urlPublica = optionalText(body.urlPublica, "URL pública", 300);
    const modoPainelPadrao = (body.modoPainelPadrao ?? "colaborador") as ModoPainel;

    const config = await salvarConfigAprovacoes(
      { emailRelatorio, urlPublica, modoPainelPadrao },
      acesso.usuario.nomeExibicao
    );

    return NextResponse.json({ ok: true, message: "Configuração salva.", data: config });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao salvar configuração de aprovações:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível salvar a configuração." },
      { status: 500 }
    );
  }
}

export const PUT = comMetricasApi("admin/aprovacoes/config", handlePUT);
