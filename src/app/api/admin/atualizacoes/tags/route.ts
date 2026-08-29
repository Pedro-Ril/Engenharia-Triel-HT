import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import {
  isObject,
  optionalInteger,
  requiredChave,
  requiredText,
} from "@/lib/auth/validation";
import { criarTag, listarTags } from "@/lib/atualizacoes/atualizacoes";
import { CORES_TAG_DISPONIVEIS } from "@/lib/atualizacoes/cores-tag";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requiredCor(value: unknown, fieldName: string): string {
  const texto = requiredText(value, fieldName, 20);

  if (!(CORES_TAG_DISPONIVEIS as readonly string[]).includes(texto)) {
    throw new ValidationError(
      `O campo ${fieldName} deve ser uma das cores disponíveis.`
    );
  }

  return texto;
}

async function handleGET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const tags = await listarTags();
    return NextResponse.json({ ok: true, data: tags });
  } catch (error) {
    console.error("Erro ao listar tags de atualização:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar as tags." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/atualizacoes/tags", handleGET);

interface CreateTagBody {
  chave?: unknown;
  nome?: unknown;
  cor?: unknown;
  ordem?: unknown;
}

async function handlePOST(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  let body: CreateTagBody;

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
    const chave = requiredChave(body.chave, "chave");
    const nome = requiredText(body.nome, "nome", 100);
    const cor = requiredCor(body.cor, "cor");
    const ordem = optionalInteger(body.ordem, "ordem", 0);

    const tag = await criarTag({ chave, nome, cor, ordem });

    return NextResponse.json(
      { ok: true, message: "Tag criada.", data: tag },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao criar tag de atualização:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível criar a tag." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("admin/atualizacoes/tags", handlePOST);
