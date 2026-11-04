import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalText, requiredText, requiredUuidArray } from "@/lib/auth/validation";
import { ajustarStatusEquipamento } from "@/lib/estoque-equipamentos-usados/ajustes-admin";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import type { MotivoBaixa, StatusEquipamento } from "@/modules/estoque-equipamentos-usados/types/estoque.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODULO_CHAVE = "estoque-equipamentos-usados";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/* Ajuste manual do status final (só administrador) -- ver ajustes-admin.ts. */
async function handlePOST(request: Request, context: RouteContext) {
  const acesso = await verificarAcessoModuloApi(MODULO_CHAVE);
  if (acesso.negado) return acesso.negado;
  const { usuario } = acesso;

  if (!usuario.ehAdministrador) {
    return NextResponse.json({ ok: false, message: "Apenas administradores podem ajustar o status." }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const corpo: unknown = await request.json().catch(() => null);
    if (!isObject(corpo)) throw new ValidationError("Requisição inválida.");

    const resultado = await ajustarStatusEquipamento({
      id: requiredUuidArray([id], "equipamento")[0],
      novoStatus: requiredText(corpo.status, "status", 20) as StatusEquipamento,
      motivoBaixa: (optionalText(corpo.motivoBaixa, "motivo da baixa", 20) as MotivoBaixa | null) ?? null,
      comQuem: optionalText(corpo.comQuem, "com quem", 200) ?? null,
      motivo: requiredText(corpo.motivo, "motivo", 500),
      usuarioId: usuario.id,
      usuarioNome: usuario.nomeExibicao,
    });

    return NextResponse.json({ ok: true, message: "Status ajustado.", data: resultado });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    console.error("Erro ao ajustar o status do equipamento:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível ajustar o status." }, { status: 500 });
  }
}

export const POST = comMetricasApi("estoque-equipamentos-usados/[id]/status", handlePOST);
