import { NextRequest, NextResponse } from "next/server";

import { ValidationError } from "@/lib/auth/errors";
import { verificarAcessoIntegraLantekApi } from "@/lib/integra-lantek/autorizacao-integra-lantek";
import { obterConfigParaRotas } from "@/lib/integra-lantek/integra-lantek-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const acesso = await verificarAcessoIntegraLantekApi();
  if (acesso.negado) return acesso.negado;

  try {
    const body = await request.json();
    const tipo = body?.tipo;
    const valor = String(body?.valor ?? "").trim();

    if (!tipo || !["lote", "ordem"].includes(tipo)) {
      return NextResponse.json(
        { error: "Tipo de busca inválido. Use 'lote' ou 'ordem'." },
        { status: 400 }
      );
    }

    if (!valor) {
      return NextResponse.json(
        { error: "Informe um valor para a busca." },
        { status: 400 }
      );
    }

    let config;
    try {
      config = await obterConfigParaRotas();
    } catch (error) {
      if (error instanceof ValidationError) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      throw error;
    }

    const url = new URL(config.foccoApiBaseUrl);
    url.searchParams.set("chave", config.foccoApiChave);

    if (tipo === "lote") {
      url.searchParams.set("num_lote_pro", valor);
    }

    if (tipo === "ordem") {
      url.searchParams.set("num_ordem", valor);
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.foccoApiToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    const contentType = response.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");

    const data = isJson ? await response.json() : await response.text();

    if (!response.ok) {
      return NextResponse.json(
        {
          error: "Falha ao consultar a API do FOCCO.",
          status: response.status,
          details: data,
        },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Erro na rota de busca:", error);

    return NextResponse.json(
      { error: "Erro interno ao processar a busca." },
      { status: 500 }
    );
  }
}
