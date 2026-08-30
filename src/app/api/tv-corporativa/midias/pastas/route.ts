import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, requiredText } from "@/lib/auth/validation";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { criarPastaMidia, listarPastasMidia } from "@/lib/tv/midias";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET() {
  const acesso = await verificarAcessoModuloApi("tv-corporativa");
  if (acesso.negado) return acesso.negado;

  try {
    const pastas = await listarPastasMidia();
    return NextResponse.json({ ok: true, data: pastas });
  } catch (error) {
    console.error("Erro ao listar pastas de mídia de TV:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar as pastas." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("tv-corporativa/midias/pastas", handleGET);

interface CriarPastaBody {
  nome?: unknown;
}

async function handlePOST(request: Request) {
  const acesso = await verificarAcessoModuloApi("tv-corporativa");
  if (acesso.negado) return acesso.negado;

  let body: CriarPastaBody;

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
    const nome = requiredText(body.nome, "nome", 100);
    const pasta = await criarPastaMidia(nome);

    return NextResponse.json({ ok: true, message: "Pasta criada.", data: pasta }, { status: 201 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao criar pasta de mídia de TV:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível criar a pasta." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("tv-corporativa/midias/pastas", handlePOST);
