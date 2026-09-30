import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { obterConfigParaRotasTubest } from "@/lib/integra-tubest/integra-tubest-config";
import { registrarLog } from "@/lib/monitoramento/logs";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ORIGEM_LOG = "integra-tubest/buscar";

async function handlePOST(request: Request) {
  const acesso = await verificarAcessoModuloApi("integra-tubest");
  if (acesso.negado) return acesso.negado;

  try {
    const body = await request.json();
    const tipo = body?.tipo;
    const valor = String(body?.valor ?? "").trim();

    if (!tipo || !["lote", "ordem"].includes(tipo)) {
      return NextResponse.json(
        { ok: false, message: "Tipo de busca inválido. Use 'lote' ou 'ordem'." },
        { status: 400 }
      );
    }

    if (!valor) {
      return NextResponse.json(
        { ok: false, message: "Informe um valor para a busca." },
        { status: 400 }
      );
    }

    let config;
    try {
      config = await obterConfigParaRotasTubest();
    } catch (error) {
      if (error instanceof ValidationError) {
        return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
      }
      throw error;
    }

    const url = new URL(config.foccoApiBaseUrl);
    url.searchParams.set("chave", config.foccoApiChave);
    url.searchParams.set(tipo === "lote" ? "num_lote_pro" : "num_ordem", valor);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.foccoApiToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json")
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      await registrarLog({
        nivel: "erro",
        origem: ORIGEM_LOG,
        mensagem: `Endpoint do Focco respondeu ${response.status} para ${tipo} ${valor}.`,
        detalhes: typeof data === "string" ? data.slice(0, 2000) : JSON.stringify(data).slice(0, 2000),
      });

      return NextResponse.json(
        { ok: false, message: "Falha ao consultar a API do FoccoERP.", data },
        { status: response.status }
      );
    }

    const itens = Array.isArray(data?.value) ? data.value : [];

    await registrarLog({
      nivel: "info",
      origem: ORIGEM_LOG,
      mensagem: `${acesso.usuario.samAccountName} consultou ${tipo} ${valor}: ${itens.length} item(ns).`,
    });

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    console.error("Erro na busca da Integração TuBest:", error);

    await registrarLog({
      nivel: "erro",
      origem: ORIGEM_LOG,
      mensagem: "Erro inesperado ao consultar o endpoint do Focco.",
      detalhes: error instanceof Error ? error.stack ?? error.message : String(error),
    });

    return NextResponse.json(
      { ok: false, message: "Erro interno ao processar a busca." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("integra-tubest/buscar", handlePOST);
