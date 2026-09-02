import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalText } from "@/lib/auth/validation";
import {
  buscarConfigIntegraLantek,
  salvarConfigIntegraLantek,
} from "@/lib/integra-lantek/integra-lantek-config";
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
    const config = await buscarConfigIntegraLantek();
    return NextResponse.json({ ok: true, data: config });
  } catch (error) {
    console.error("Erro ao buscar configuração de integração Lantek:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível buscar a configuração." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/integra-lantek/config", handleGET);

interface ConfigBody {
  foccoApiBaseUrl?: unknown;
  foccoApiChave?: unknown;
  foccoApiToken?: unknown;
  pastaDxf?: unknown;
  pastaDesenhos?: unknown;
  pastaExportacaoAgro?: unknown;
  pastaExportacaoVe?: unknown;
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
    const foccoApiBaseUrl = validarUrl(
      optionalText(body.foccoApiBaseUrl, "URL da API do FoccoERP", 300),
      "A URL da API do FoccoERP"
    );
    const foccoApiChave = optionalText(body.foccoApiChave, "Chave da integração", 50);
    const foccoApiToken = optionalText(body.foccoApiToken, "Token da API", 1000);
    const pastaDxf = optionalText(body.pastaDxf, "Pasta de DXF", 300);
    const pastaDesenhos = optionalText(body.pastaDesenhos, "Pasta de desenhos", 300);
    const pastaExportacaoAgro = optionalText(
      body.pastaExportacaoAgro,
      "Pasta de exportação (Agro)",
      300
    );
    const pastaExportacaoVe = optionalText(
      body.pastaExportacaoVe,
      "Pasta de exportação (Viaturas Especiais)",
      300
    );

    const config = await salvarConfigIntegraLantek({
      foccoApiBaseUrl,
      foccoApiChave,
      foccoApiToken,
      pastaDxf,
      pastaDesenhos,
      pastaExportacaoAgro,
      pastaExportacaoVe,
      atualizadoPor: acesso.usuario.samAccountName,
    });

    return NextResponse.json({ ok: true, message: "Configuração salva.", data: config });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao salvar configuração de integração Lantek:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível salvar a configuração." },
      { status: 500 }
    );
  }
}

export const PATCH = comMetricasApi("admin/integra-lantek/config", handlePATCH);
