import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalBoolean, optionalInteger, optionalText, requiredText } from "@/lib/auth/validation";
import {
  criarCampoTipo,
  listarCamposDoTipo,
  type TipoDadoCampoEquipamento,
} from "@/lib/estoque-equipamentos-usados/tipos-equipamento";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uniqueIdentifierPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIPOS_DADO_VALIDOS: TipoDadoCampoEquipamento[] = [
  "texto",
  "numero",
  "data",
  "booleano",
  "unica_escolha",
  "multipla_escolha",
];

interface RouteContext {
  params: Promise<{ id: string }>;
}

function requiredBlocoId(value: unknown): string {
  if (typeof value !== "string" || !uniqueIdentifierPattern.test(value)) {
    throw new ValidationError("Informe um bloco válido.");
  }
  return value;
}

function requiredTipoDado(value: unknown): TipoDadoCampoEquipamento {
  if (typeof value !== "string" || !(TIPOS_DADO_VALIDOS as string[]).includes(value)) {
    throw new ValidationError("Informe um tipo de dado válido.");
  }
  return value as TipoDadoCampoEquipamento;
}

function optionalOpcoes(value: unknown): string[] | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && item.trim())) {
    throw new ValidationError("As opções devem ser uma lista de textos.");
  }
  return value.map((item) => item.trim());
}

async function handleGET(request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  try {
    const campos = await listarCamposDoTipo(id);
    return NextResponse.json({ ok: true, data: campos });
  } catch (error) {
    console.error("Erro ao listar campos do tipo de equipamento:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar os campos." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/estoque-equipamentos-usados/tipos/[id]/campos", handleGET);

async function handlePOST(request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  try {
    const parsedBody: unknown = await request.json();
    if (!isObject(parsedBody)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }

    const blocoId = requiredBlocoId(parsedBody.blocoId);
    const chave = requiredText(parsedBody.chave, "chave", 60);
    const rotulo = requiredText(parsedBody.rotulo, "rótulo", 150);
    const tipoDado = requiredTipoDado(parsedBody.tipoDado);
    const opcoes = optionalOpcoes(parsedBody.opcoes);
    const unidade = optionalText(parsedBody.unidade, "unidade", 20);
    const obrigatorio = optionalBoolean(parsedBody.obrigatorio, "obrigatório", false);
    const ordem = optionalInteger(parsedBody.ordem, "ordem", 0);
    const vemDeIntegracao = optionalBoolean(parsedBody.vemDeIntegracao, "vem de integração", false);

    const campo = await criarCampoTipo(id, {
      blocoId,
      chave,
      rotulo,
      tipoDado,
      opcoes,
      unidade,
      obrigatorio,
      ordem,
      vemDeIntegracao,
    });

    return NextResponse.json({ ok: true, message: "Campo criado.", data: campo }, { status: 201 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao criar campo do tipo de equipamento:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível criar o campo." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("admin/estoque-equipamentos-usados/tipos/[id]/campos", handlePOST);
