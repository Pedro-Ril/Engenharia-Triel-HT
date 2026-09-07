import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalText, requiredText } from "@/lib/auth/validation";
import { criarTemplate, listarTemplates } from "@/lib/desenho-aprovacao/templates";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FORMATOS_VALIDOS = ["A0", "A1", "A2", "A3", "A4", "custom"];
const ORIENTACOES_VALIDAS = ["horizontal", "vertical"];

interface CreateTemplateBody {
  nome?: unknown;
  descricao?: unknown;
  formatoPapel?: unknown;
  orientacao?: unknown;
  larguraMm?: unknown;
  alturaMm?: unknown;
}

function requiredPositiveNumber(value: unknown, fieldName: string): number {
  const numero = Number(value);

  if (!Number.isFinite(numero) || numero <= 0) {
    throw new ValidationError(`O campo ${fieldName} deve ser um número maior que zero.`);
  }

  return numero;
}

async function handleGET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const templates = await listarTemplates();
    return NextResponse.json({ ok: true, data: templates });
  } catch (error) {
    console.error("Erro ao listar templates de desenho de aprovação:", error);

    return NextResponse.json(
      { ok: false, message: "Não foi possível listar os templates." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/desenho-aprovacao/templates", handleGET);

async function handlePOST(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  let body: CreateTemplateBody;

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
    const nome = requiredText(body.nome, "nome", 400);
    const descricao = optionalText(body.descricao, "descricao", 2000);

    if (typeof body.formatoPapel !== "string" || !FORMATOS_VALIDOS.includes(body.formatoPapel)) {
      throw new ValidationError('O campo formatoPapel deve ser "A0", "A1", "A2", "A3", "A4" ou "custom".');
    }

    const formatoPapel = body.formatoPapel;

    if (typeof body.orientacao !== "string" || !ORIENTACOES_VALIDAS.includes(body.orientacao)) {
      throw new ValidationError('O campo orientacao deve ser "horizontal" ou "vertical".');
    }

    const orientacao = body.orientacao as "horizontal" | "vertical";

    const larguraMm = requiredPositiveNumber(body.larguraMm, "larguraMm");
    const alturaMm = requiredPositiveNumber(body.alturaMm, "alturaMm");

    const template = await criarTemplate(
      { nome, descricao, formatoPapel, orientacao, larguraMm, alturaMm },
      acesso.usuario.samAccountName
    );

    return NextResponse.json(
      { ok: true, message: "Template criado.", data: template },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao criar template de desenho de aprovação:", error);

    return NextResponse.json(
      { ok: false, message: "Não foi possível criar o template." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("admin/desenho-aprovacao/templates", handlePOST);
