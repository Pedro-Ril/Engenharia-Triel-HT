import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalText } from "@/lib/auth/validation";
import {
  buscarConfigEstruturaSubstituicao,
  salvarConfigEstruturaSubstituicao,
} from "@/lib/estrutura-substituicao/estrutura-substituicao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const urlPattern = /^https?:\/\//i;

function validarUrl(valor: string | null, campo: string): string | null {
  if (!valor) return null;
  if (!urlPattern.test(valor)) {
    throw new ValidationError(`${campo} deve começar com http:// ou https://.`);
  }
  return valor.replace(/\/+$/, "");
}

async function handleGET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const config = await buscarConfigEstruturaSubstituicao();
    return NextResponse.json({ ok: true, data: config });
  } catch (error) {
    console.error("Erro ao buscar configuração de substituição de estrutura:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível buscar a configuração." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/estrutura-substituicao/config", handleGET);

interface ConfigBody {
  urlConsultaEstrutura?: unknown;
  urlValidarItens?: unknown;
  urlAtualizarEstrutura?: unknown;
  urlConsultaEstruturaTeste?: unknown;
  urlValidarItensTeste?: unknown;
  urlAtualizarEstruturaTeste?: unknown;
  usarAmbienteTeste?: unknown;
}

async function handlePATCH(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  let body: ConfigBody;

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
    const urlConsultaEstrutura = validarUrl(
      optionalText(body.urlConsultaEstrutura, "URL de consulta da estrutura", 300),
      "A URL de consulta da estrutura"
    );
    const urlValidarItens = validarUrl(
      optionalText(body.urlValidarItens, "URL de validação de itens", 300),
      "A URL de validação de itens"
    );
    const urlAtualizarEstrutura = validarUrl(
      optionalText(body.urlAtualizarEstrutura, "URL de atualização da estrutura", 300),
      "A URL de atualização da estrutura"
    );
    const urlConsultaEstruturaTeste = validarUrl(
      optionalText(body.urlConsultaEstruturaTeste, "URL de consulta da estrutura (teste)", 300),
      "A URL de consulta da estrutura (teste)"
    );
    const urlValidarItensTeste = validarUrl(
      optionalText(body.urlValidarItensTeste, "URL de validação de itens (teste)", 300),
      "A URL de validação de itens (teste)"
    );
    const urlAtualizarEstruturaTeste = validarUrl(
      optionalText(body.urlAtualizarEstruturaTeste, "URL de atualização da estrutura (teste)", 300),
      "A URL de atualização da estrutura (teste)"
    );

    if (typeof body.usarAmbienteTeste !== "boolean") {
      throw new ValidationError("O campo usarAmbienteTeste deve ser verdadeiro ou falso.");
    }

    const config = await salvarConfigEstruturaSubstituicao({
      urlConsultaEstrutura,
      urlValidarItens,
      urlAtualizarEstrutura,
      urlConsultaEstruturaTeste,
      urlValidarItensTeste,
      urlAtualizarEstruturaTeste,
      usarAmbienteTeste: body.usarAmbienteTeste,
      atualizadoPor: acesso.usuario.samAccountName,
    });

    return NextResponse.json({ ok: true, message: "Configuração salva.", data: config });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao salvar configuração de substituição de estrutura:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível salvar a configuração." },
      { status: 500 }
    );
  }
}

export const PATCH = comMetricasApi("admin/estrutura-substituicao/config", handlePATCH);
