import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalInteger, requiredText } from "@/lib/auth/validation";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import {
  buscarConfigTransferencia,
  salvarConfigTransferencia,
} from "@/lib/transferencia/transferencia-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const config = await buscarConfigTransferencia();
    return NextResponse.json({ ok: true, data: config });
  } catch (error) {
    console.error("Erro ao buscar configuração de transferência de arquivos:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível buscar a configuração." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/transferencia-arquivos/config", handleGET);

interface ConfigBody {
  pastaArmazenamento?: unknown;
  duracaoMaximaHoras?: unknown;
}

async function handlePATCH(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const parsedBody: unknown = await request.json();
    if (!isObject(parsedBody)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }
    const body = parsedBody as ConfigBody;

    const pastaArmazenamento = requiredText(body.pastaArmazenamento, "pasta de armazenamento", 300);
    const duracaoMaximaHoras =
      body.duracaoMaximaHoras === undefined || body.duracaoMaximaHoras === null
        ? null
        : optionalInteger(body.duracaoMaximaHoras, "duração máxima", 0) || null;

    if (duracaoMaximaHoras !== null && duracaoMaximaHoras <= 0) {
      throw new ValidationError("A duração máxima deve ser maior que zero.");
    }

    const config = await salvarConfigTransferencia({
      pastaArmazenamento,
      duracaoMaximaHoras,
      atualizadoPor: acesso.usuario.samAccountName,
    });

    return NextResponse.json({ ok: true, message: "Configuração salva.", data: config });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao salvar configuração de transferência de arquivos:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível salvar a configuração." },
      { status: 500 }
    );
  }
}

export const PATCH = comMetricasApi("admin/transferencia-arquivos/config", handlePATCH);
