import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalText, requiredUuidArray } from "@/lib/auth/validation";
import { listarPastasPorEmpresa, salvarPastasEmpresa } from "@/lib/conferencia-derivados/config";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* As pastas de cada empresa ativa (configurada ou não). */
async function handleGET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const empresas = await listarPastasPorEmpresa();
    return NextResponse.json({ ok: true, data: empresas });
  } catch (error) {
    console.error("Erro ao buscar configuração da conferência de derivados:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível buscar a configuração." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/conferencia-derivados/config", handleGET);

/* Salva as pastas de UMA empresa: { empresaId, pastaPdf, pastaDxf, pastaStep }. */
async function handlePATCH(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const corpo: unknown = await request.json().catch(() => null);

    if (!isObject(corpo)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }

    const empresa = await salvarPastasEmpresa({
      empresaId: requiredUuidArray([corpo.empresaId], "empresa")[0],
      pastaPdf: optionalText(corpo.pastaPdf, "Pasta de PDF", 300),
      pastaDxf: optionalText(corpo.pastaDxf, "Pasta de DXF", 300),
      pastaStep: optionalText(corpo.pastaStep, "Pasta de STEP", 300),
      atualizadoPor: acesso.usuario.samAccountName,
    });

    return NextResponse.json({ ok: true, message: "Configuração salva.", data: empresa });
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
