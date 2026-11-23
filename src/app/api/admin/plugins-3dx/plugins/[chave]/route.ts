import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject } from "@/lib/auth/validation";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { atualizarPlugin, ehAmbiente, PARAMETROS_PLUGIN } from "@/lib/plugins-3dx/plugins-3dx";
import type { ModoPlugin3dx } from "@/modules/plugins-3dx/types/plugins3dx.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handlePUT(request: Request, contexto: { params: Promise<{ chave: string }> }) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { chave } = await contexto.params;
  try {
    if (!PARAMETROS_PLUGIN[chave]) throw new ValidationError("Plugin desconhecido.");
    const body: unknown = await request.json().catch(() => null);
    if (!isObject(body)) throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    if (body.modo !== undefined && typeof body.modo !== "string") throw new ValidationError("Modo inválido.");
    if (!ehAmbiente(body.ambiente)) throw new ValidationError("Informe o ambiente (PRODUCAO ou TESTE).");

    await atualizarPlugin(
      chave,
      body.ambiente,
      { modo: body.modo as ModoPlugin3dx | undefined, parametros: body.parametros },
      acesso.usuario
    );
    return NextResponse.json({
      ok: true,
      message: "Salvo. Os nós do 3DSpace aplicam em até 1 minuto, sem reiniciar.",
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    console.error("Erro ao salvar o plugin 3DX:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível salvar o plugin." }, { status: 500 });
  }
}

export const PUT = comMetricasApi("admin/plugins-3dx/plugins", handlePUT);
