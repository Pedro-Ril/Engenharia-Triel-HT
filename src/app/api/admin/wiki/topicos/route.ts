import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalText, requiredText } from "@/lib/auth/validation";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { criarTopico, listarTopicos } from "@/lib/wiki/wiki-topicos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const topicos = await listarTopicos();
    return NextResponse.json({ ok: true, data: topicos });
  } catch (error) {
    console.error("Erro ao listar tópicos do wiki:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar os tópicos." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/wiki/topicos", handleGET);

interface TopicoBody {
  nome?: unknown;
  icone?: unknown;
}

async function handlePOST(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const parsedBody: unknown = await request.json();
    if (!isObject(parsedBody)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }
    const body = parsedBody as TopicoBody;

    const nome = requiredText(body.nome, "nome do tópico", 150);
    const icone = optionalText(body.icone, "ícone", 60);

    const topico = await criarTopico({ nome, icone });

    return NextResponse.json({ ok: true, message: "Tópico criado.", data: topico });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao criar tópico do wiki:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível criar o tópico." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("admin/wiki/topicos", handlePOST);
