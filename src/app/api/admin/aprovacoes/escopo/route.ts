import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalText, requiredText } from "@/lib/auth/validation";
import {
  adicionarRegraEscopo,
  listarRegrasEscopo,
  type TipoRegraEscopo,
} from "@/lib/aprovacoes/escopo-colaboradores";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIPOS_VALIDOS: TipoRegraEscopo[] = ["unidade_permitida", "setor_excluido", "colaborador_excluido"];

function validarTipo(valor: unknown): TipoRegraEscopo {
  const texto = requiredText(valor, "tipo", 30);
  if (!TIPOS_VALIDOS.includes(texto as TipoRegraEscopo)) {
    throw new ValidationError("Tipo de regra inválido.");
  }
  return texto as TipoRegraEscopo;
}

async function handleGET(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const usuarioId = new URL(request.url).searchParams.get("usuarioId");
  if (!usuarioId) {
    return NextResponse.json({ ok: false, message: "Informe usuarioId." }, { status: 400 });
  }

  try {
    const regras = await listarRegrasEscopo(usuarioId);
    return NextResponse.json({ ok: true, data: regras });
  } catch (error) {
    console.error("Erro ao listar regras de escopo:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar as regras de escopo." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/aprovacoes/escopo", handleGET);

interface CriarRegraEscopoBody {
  usuarioId?: unknown;
  tipo?: unknown;
  valor?: unknown;
  valorRotulo?: unknown;
}

async function handlePOST(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const body: unknown = await request.json();
    if (!isObject(body)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }
    const parsed = body as CriarRegraEscopoBody;

    const usuarioId = requiredText(parsed.usuarioId, "usuarioId", 36);
    const tipo = validarTipo(parsed.tipo);
    const valor = requiredText(parsed.valor, "valor", 200);
    const valorRotulo = optionalText(parsed.valorRotulo, "valorRotulo", 200);

    const regra = await adicionarRegraEscopo(usuarioId, tipo, valor, valorRotulo);

    return NextResponse.json({ ok: true, message: "Regra adicionada.", data: regra }, { status: 201 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao adicionar regra de escopo:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível adicionar a regra." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("admin/aprovacoes/escopo", handlePOST);
