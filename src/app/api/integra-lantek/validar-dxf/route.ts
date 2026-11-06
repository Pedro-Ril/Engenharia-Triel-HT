import { NextRequest, NextResponse } from "next/server";

import { ValidationError } from "@/lib/auth/errors";
import { verificarAcessoIntegraLantekApi } from "@/lib/integra-lantek/autorizacao-integra-lantek";
import { escolherDxf, listarDxfRecursivo } from "@/lib/integra-lantek/dxf-indice";
import { lerModuloLantek, registrarEventoLantek } from "@/lib/integra-lantek/eventos";
import { obterConfigParaRotas } from "@/lib/integra-lantek/integra-lantek-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ItemValidacao = {
  codigo: string;
  codDesenho?: string | null;
};

type RequestBody = {
  itens: ItemValidacao[];
  modulo?: unknown;
  /* "pesquisa" (ao buscar ordem/lote) ou "confirmacao" (ao colocar as linhas na grade). */
  etapa?: unknown;
};

export async function POST(request: NextRequest) {
  const acesso = await verificarAcessoIntegraLantekApi();
  if (acesso.negado) return acesso.negado;
  const { usuario } = acesso;
  const inicio = performance.now();

  try {
    const body = (await request.json()) as RequestBody;
    const modulo = lerModuloLantek(body?.modulo);
    const etapa = body?.etapa === "pesquisa" || body?.etapa === "confirmacao" ? body.etapa : null;
    const itens = Array.isArray(body?.itens) ? body.itens : [];

    if (!itens.length) {
      return NextResponse.json(
        { error: "Nenhum item foi informado para validação." },
        { status: 400 }
      );
    }

    const itensNormalizados = itens
      .map((item) => ({
        codigo: String(item?.codigo ?? "").trim(),
        codDesenho: String(item?.codDesenho ?? "").trim(),
      }))
      .filter((item) => item.codigo || item.codDesenho);

    if (!itensNormalizados.length) {
      return NextResponse.json(
        { error: "Nenhum código válido foi informado para validação." },
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

    const indice = await listarDxfRecursivo(config.pastaDxf);

    const resultados = itensNormalizados.map(({ codigo, codDesenho }) => {
      const { encontrados, codigoUsado, origem, principal } = escolherDxf(indice, codigo, codDesenho);

      return {
        codigo,
        codDesenho,
        codigoUsado,
        origem,
        existe: encontrados.length > 0,
        duplicado: encontrados.length > 1,
        caminho: principal?.caminho ?? "",
        arquivo: principal?.arquivo ?? "",
        caminhos: encontrados.map((item) => item.caminho),
      };
    });

    const semDxf = resultados.filter((r) => !r.existe).length;
    const repetidos = resultados.filter((r) => r.duplicado).length;
    const peloDesenho = resultados.filter((r) => r.origem === "cod_desenho").length;
    await registrarEventoLantek({
      modulo,
      tipo: "validacao_dxf",
      sucesso: true,
      resumo: `Busca de DXF${etapa === "confirmacao" ? " (ao confirmar)" : etapa === "pesquisa" ? " (na pesquisa)" : ""}: ${resultados.length} item(ns) · ${semDxf} sem DXF · ${repetidos} com mais de um DXF · ${peloDesenho} pelo código do desenho`,
      parametros: { etapa, pastaDxf: config.pastaDxf, totalItens: itensNormalizados.length },
      resultado: resultados.map((r) => ({
        codigo: r.codigo,
        codDesenho: r.codDesenho,
        origem: r.origem,
        caminho: r.caminho,
        duplicado: r.duplicado,
        caminhos: r.caminhos,
      })),
      total: resultados.length,
      duracaoMs: performance.now() - inicio,
      usuarioId: usuario.id,
      usuarioNome: usuario.nomeExibicao,
    });

    return NextResponse.json({
      success: true,
      total: resultados.length,
      resultados,
    });
  } catch (error) {
    console.error("Erro ao validar DXF:", error);

    return NextResponse.json(
      {
        error: "Erro interno ao validar os arquivos DXF.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
