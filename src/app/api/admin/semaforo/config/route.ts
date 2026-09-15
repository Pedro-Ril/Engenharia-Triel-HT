import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalBoolean, optionalText } from "@/lib/auth/validation";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { buscarConfigSemaforo, salvarConfigSemaforo } from "@/lib/semaforo/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const config = await buscarConfigSemaforo();
    return NextResponse.json({ ok: true, data: config });
  } catch (error) {
    console.error("Erro ao buscar a configuração do Semáforo:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível buscar a configuração." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/semaforo/config", handleGET);

interface ConfigBody {
  modoLegado?: unknown;
  mediamtxApiUrl?: unknown;
  mediamtxWhepBaseUrl?: unknown;
}

async function handlePUT(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const parsedBody: unknown = await request.json();
    if (!isObject(parsedBody)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }
    const body: ConfigBody = parsedBody;

    const modoLegado = optionalBoolean(body.modoLegado, "modo legado", true);
    const mediamtxApiUrl = optionalText(body.mediamtxApiUrl, "URL da API do MediaMTX", 300);
    const mediamtxWhepBaseUrl = optionalText(body.mediamtxWhepBaseUrl, "URL WHEP do MediaMTX", 300);

    const config = await salvarConfigSemaforo({
      modoLegado,
      mediamtxApiUrl,
      mediamtxWhepBaseUrl,
      atualizadoPor: acesso.usuario.nomeExibicao,
    });

    return NextResponse.json({ ok: true, message: "Configuração salva.", data: config });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao salvar a configuração do Semáforo:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível salvar a configuração." },
      { status: 500 }
    );
  }
}

export const PUT = comMetricasApi("admin/semaforo/config", handlePUT);
