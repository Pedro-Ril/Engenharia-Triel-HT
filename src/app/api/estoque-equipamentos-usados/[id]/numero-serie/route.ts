import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, requiredText, requiredUuidArray } from "@/lib/auth/validation";
import { corrigirNumeroSerie } from "@/lib/estoque-equipamentos-usados/ajustes-admin";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODULO_CHAVE = "estoque-equipamentos-usados";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/* Corrige só o número de série (só administrador) -- ver ajustes-admin.ts. */
async function handlePOST(request: Request, context: RouteContext) {
  const acesso = await verificarAcessoModuloApi(MODULO_CHAVE);
  if (acesso.negado) return acesso.negado;
  const { usuario } = acesso;

  if (!usuario.ehAdministrador) {
    return NextResponse.json({ ok: false, message: "Apenas administradores podem corrigir o número de série." }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const corpo: unknown = await request.json().catch(() => null);
    if (!isObject(corpo)) throw new ValidationError("Requisição inválida.");

    const resultado = await corrigirNumeroSerie({
      id: requiredUuidArray([id], "equipamento")[0],
      novoNumeroSerie: requiredText(corpo.numeroSerie, "número de série", 100),
      motivo: requiredText(corpo.motivo, "motivo", 500),
      usuarioNome: usuario.nomeExibicao,
    });

    return NextResponse.json({ ok: true, message: `Número de série corrigido para ${resultado.numeroSerie}.`, data: resultado });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    console.error("Erro ao corrigir o número de série:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível corrigir o número de série." }, { status: 500 });
  }
}

export const POST = comMetricasApi("estoque-equipamentos-usados/[id]/numero-serie", handlePOST);
