import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalBoolean, optionalInteger, optionalText } from "@/lib/auth/validation";
import {
  atualizarCampoTipo,
  excluirCampoTipo,
  type TipoDadoCampoEquipamento,
} from "@/lib/estoque-equipamentos-usados/tipos-equipamento";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIPOS_DADO_VALIDOS: TipoDadoCampoEquipamento[] = [
  "texto",
  "numero",
  "data",
  "booleano",
  "unica_escolha",
  "multipla_escolha",
];

interface RouteContext {
  params: Promise<{ id: string; campoId: string }>;
}

function optionalTipoDado(value: unknown): TipoDadoCampoEquipamento | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !(TIPOS_DADO_VALIDOS as string[]).includes(value)) {
    throw new ValidationError("Informe um tipo de dado válido.");
  }
  return value as TipoDadoCampoEquipamento;
}

function optionalOpcoes(value: unknown): string[] | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && item.trim())) {
    throw new ValidationError("As opções devem ser uma lista de textos.");
  }
  return value.map((item) => item.trim());
}

async function handlePATCH(request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { campoId } = await context.params;

  try {
    const parsedBody: unknown = await request.json();
    if (!isObject(parsedBody)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }

    await atualizarCampoTipo(campoId, {
      rotulo: optionalText(parsedBody.rotulo, "rótulo", 150) ?? undefined,
      tipoDado: optionalTipoDado(parsedBody.tipoDado),
      opcoes: optionalOpcoes(parsedBody.opcoes),
      unidade: parsedBody.unidade === undefined ? undefined : optionalText(parsedBody.unidade, "unidade", 20),
      obrigatorio:
        parsedBody.obrigatorio === undefined
          ? undefined
          : optionalBoolean(parsedBody.obrigatorio, "obrigatório", false),
      ordem: parsedBody.ordem === undefined ? undefined : optionalInteger(parsedBody.ordem, "ordem", 0),
      ativo: parsedBody.ativo === undefined ? undefined : optionalBoolean(parsedBody.ativo, "ativo", true),
      geraPendencia:
        parsedBody.geraPendencia === undefined
          ? undefined
          : optionalBoolean(parsedBody.geraPendencia, "vira status", false),
      travaMovimentacao:
        parsedBody.travaMovimentacao === undefined
          ? undefined
          : optionalBoolean(parsedBody.travaMovimentacao, "trava movimentações", false),
      vemDeIntegracao:
        parsedBody.vemDeIntegracao === undefined
          ? undefined
          : optionalBoolean(parsedBody.vemDeIntegracao, "vem de integração", false),
    });

    return NextResponse.json({ ok: true, message: "Campo atualizado." });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao atualizar campo do tipo de equipamento:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível atualizar o campo." },
      { status: 500 }
    );
  }
}

export const PATCH = comMetricasApi(
  "admin/estoque-equipamentos-usados/tipos/[id]/campos/[campoId]",
  handlePATCH
);

async function handleDELETE(request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { campoId } = await context.params;

  try {
    await excluirCampoTipo(campoId);
    return NextResponse.json({ ok: true, message: "Campo excluído." });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao excluir campo do tipo de equipamento:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível excluir o campo." },
      { status: 500 }
    );
  }
}

export const DELETE = comMetricasApi(
  "admin/estoque-equipamentos-usados/tipos/[id]/campos/[campoId]",
  handleDELETE
);
