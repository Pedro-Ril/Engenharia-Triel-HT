import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalBoolean, requiredText, requiredUuidArray } from "@/lib/auth/validation";
import { trocarNumeroEquipamento } from "@/lib/estoque-equipamentos-usados/troca-numero";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODULO_CHAVE = "estoque-equipamentos-usados";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/* Troca o número do equipamento (só administrador) -- ver troca-numero.ts. */
async function handlePOST(request: Request, context: RouteContext) {
  const acesso = await verificarAcessoModuloApi(MODULO_CHAVE);
  if (acesso.negado) return acesso.negado;
  const { usuario } = acesso;

  if (!usuario.ehAdministrador) {
    return NextResponse.json({ ok: false, message: "Apenas administradores podem trocar o número do equipamento." }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const corpo: unknown = await request.json().catch(() => null);
    if (!isObject(corpo)) throw new ValidationError("Requisição inválida.");

    const novoNumero = Number(corpo.novoNumero);
    const motivo = requiredText(corpo.motivo, "motivo", 500);
    if (motivo.length < 5) throw new ValidationError("Explique o motivo da troca (pelo menos 5 caracteres).");

    const resultado = await trocarNumeroEquipamento({
      id: requiredUuidArray([id], "equipamento")[0],
      novoNumero,
      trocarNumeroSerie: optionalBoolean(corpo.trocarNumeroSerie, "trocar número de série", false),
      desfazerIntegracao: optionalBoolean(corpo.desfazerIntegracao, "desfazer integração", false),
      motivo,
      usuarioNome: usuario.nomeExibicao,
    });

    return NextResponse.json({
      ok: true,
      message: `Equipamento #${resultado.numeroAntigo} agora é #${resultado.novoNumero}.`,
      data: resultado,
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    console.error("Erro ao trocar o número do equipamento:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível trocar o número do equipamento." }, { status: 500 });
  }
}

export const POST = comMetricasApi("estoque-equipamentos-usados/[id]/numero", handlePOST);
