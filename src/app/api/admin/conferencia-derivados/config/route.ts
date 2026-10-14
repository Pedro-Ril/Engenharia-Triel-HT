import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalText } from "@/lib/auth/validation";
import {
  buscarConfigConferenciaDerivados,
  salvarConfigConferenciaDerivados,
} from "@/lib/conferencia-derivados/config";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const config = await buscarConfigConferenciaDerivados();
    return NextResponse.json({ ok: true, data: config });
  } catch (error) {
    console.error("Erro ao buscar configuração da conferência de derivados:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível buscar a configuração." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/conferencia-derivados/config", handleGET);

async function handlePATCH(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const corpo: unknown = await request.json().catch(() => null);

    if (!isObject(corpo)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }

    const config = await salvarConfigConferenciaDerivados({
      pastaPdf: optionalText(corpo.pastaPdf, "Pasta de PDF", 300),
      pastaDxf: optionalText(corpo.pastaDxf, "Pasta de DXF", 300),
      pastaStep: optionalText(corpo.pastaStep, "Pasta de STEP", 300),
      atualizadoPor: acesso.usuario.samAccountName,
    });

    return NextResponse.json({ ok: true, message: "Configuração salva.", data: config });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao salvar configuração da conferência de derivados:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível salvar a configuração." },
      { status: 500 }
    );
  }
}

export const PATCH = comMetricasApi("admin/conferencia-derivados/config", handlePATCH);
