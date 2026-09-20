import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalBoolean, optionalInteger, optionalText } from "@/lib/auth/validation";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { atualizarRedeWifi, excluirRedeWifi } from "@/lib/tv/redes-wifi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface AtualizarRedeWifiBody {
  ssid?: unknown;
  senha?: unknown;
  ativa?: unknown;
  prioridade?: unknown;
}

async function handlePATCH(request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  try {
    const parsedBody: unknown = await request.json();
    if (!isObject(parsedBody)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }
    const body: AtualizarRedeWifiBody = parsedBody;

    const rede = await atualizarRedeWifi(id, {
      ssid: body.ssid !== undefined ? optionalText(body.ssid, "SSID", 64) ?? undefined : undefined,
      senha: body.senha !== undefined ? optionalText(body.senha, "senha", 300) : undefined,
      ativa: body.ativa !== undefined ? optionalBoolean(body.ativa, "ativa", true) : undefined,
      prioridade:
        body.prioridade !== undefined ? optionalInteger(body.prioridade, "prioridade", 0) : undefined,
      atualizadoPor: acesso.usuario.nomeExibicao,
    });

    return NextResponse.json({ ok: true, message: "Rede Wi-Fi atualizada.", data: rede });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao atualizar rede Wi-Fi da TV Corporativa:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível atualizar a rede Wi-Fi." },
      { status: 500 }
    );
  }
}

export const PATCH = comMetricasApi("admin/tv/redes-wifi/[id]", handlePATCH);

async function handleDELETE(_request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  try {
    await excluirRedeWifi(id);
    return NextResponse.json({ ok: true, message: "Rede Wi-Fi excluída." });
  } catch (error) {
    console.error("Erro ao excluir rede Wi-Fi da TV Corporativa:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível excluir a rede Wi-Fi." },
      { status: 500 }
    );
  }
}

export const DELETE = comMetricasApi("admin/tv/redes-wifi/[id]", handleDELETE);
