import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalText, requiredText } from "@/lib/auth/validation";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { buscarConfigTv, salvarConfigTv } from "@/lib/tv/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const config = await buscarConfigTv();
    return NextResponse.json({ ok: true, data: config });
  } catch (error) {
    console.error("Erro ao buscar configuração da TV Corporativa:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível buscar a configuração." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/tv/config", handleGET);

interface AtualizarConfigTvBody {
  diretorioMidias?: unknown;
  signalingUrl?: unknown;
  urlAgente?: unknown;
}

async function handlePATCH(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  let body: AtualizarConfigTvBody;

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
    const diretorioMidias = requiredText(body.diretorioMidias, "diretorioMidias", 500);
    const signalingUrl = optionalText(body.signalingUrl, "signalingUrl", 300);
    const urlAgente = optionalText(body.urlAgente, "urlAgente", 300);

    const config = await salvarConfigTv({
      diretorioMidias,
      signalingUrl,
      urlAgente,
      atualizadoPor: acesso.usuario.samAccountName,
    });

    return NextResponse.json({ ok: true, message: "Configuração salva.", data: config });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao salvar configuração da TV Corporativa:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível salvar a configuração." },
      { status: 500 }
    );
  }
}

export const PATCH = comMetricasApi("admin/tv/config", handlePATCH);
