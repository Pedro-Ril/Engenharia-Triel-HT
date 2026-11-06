import { NextRequest, NextResponse } from "next/server";

import { ValidationError } from "@/lib/auth/errors";
import { verificarAcessoIntegraLantekApi } from "@/lib/integra-lantek/autorizacao-integra-lantek";
import { lerModuloLantek, registrarEventoLantek } from "@/lib/integra-lantek/eventos";
import { obterConfigParaRotas } from "@/lib/integra-lantek/integra-lantek-config";
import { fetchMonitorado } from "@/lib/monitoramento/integracao-externa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* O que o ERP devolveu, por linha, só com o que importa para rastrear ordem/peça/DXF (registro em integra_lantek_eventos). */
function resumirItensErp(data: unknown) {
  const lista = Array.isArray((data as { value?: unknown })?.value)
    ? ((data as { value: unknown[] }).value)
    : Array.isArray(data)
      ? data
      : [];
  return lista.map((bruto) => {
    const item = (bruto ?? {}) as Record<string, unknown>;
    return {
      num_ordem: item.num_ordem ?? null,
      num_lote_pro: item.num_lote_pro ?? null,
      cod_item: item.cod_item ?? null,
      cod_desenho: item.cod_desenho ?? null,
      desc_tecnica: item.desc_tecnica ?? null,
      qtde: item.qtde ?? null,
      cod_item_mp: item.cod_item_mp ?? null,
      descricao_maquina: item.descricao_maquina ?? null,
    };
  });
}

export async function POST(request: NextRequest) {
  const acesso = await verificarAcessoIntegraLantekApi();
  if (acesso.negado) return acesso.negado;
  const { usuario } = acesso;
  const inicio = performance.now();
  let modulo: "agro" | "ve" | null = null;
  let parametros: { tipo: unknown; valor: string } | null = null;

  try {
    const body = await request.json();
    const tipo = body?.tipo;
    const valor = String(body?.valor ?? "").trim();
    modulo = lerModuloLantek(body?.modulo);
    parametros = { tipo, valor };

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

    const response = await fetchMonitorado(
      url.toString(),
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${config.foccoApiToken}`,
          Accept: "application/json",
        },
        cache: "no-store",
      },
      { servico: "erp_integra_lantek", moduloChave: "integra-lantek" }
    );

    const contentType = response.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");

    const data = isJson ? await response.json() : await response.text();

    const rotuloBusca = `${tipo === "lote" ? "Lote" : "Ordem"} ${valor}`;

    if (!response.ok) {
      await registrarEventoLantek({
        modulo,
        tipo: "pesquisa_erp",
        sucesso: false,
        resumo: `${rotuloBusca}: ERP respondeu ${response.status}`,
        parametros,
        resultado: typeof data === "string" ? data.slice(0, 4000) : data,
        duracaoMs: performance.now() - inicio,
        erro: `HTTP ${response.status}`,
        usuarioId: usuario.id,
        usuarioNome: usuario.nomeExibicao,
      });
      return NextResponse.json(
        {
          error: "Falha ao consultar a API do FOCCO.",
          status: response.status,
          details: data,
        },
        { status: response.status }
      );
    }

    const itensErp = resumirItensErp(data);
    await registrarEventoLantek({
      modulo,
      tipo: "pesquisa_erp",
      sucesso: true,
      resumo: `${rotuloBusca}: ${itensErp.length} linha(s) do ERP`,
      parametros,
      resultado: itensErp,
      total: itensErp.length,
      duracaoMs: performance.now() - inicio,
      usuarioId: usuario.id,
      usuarioNome: usuario.nomeExibicao,
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error("Erro na rota de busca:", error);

    await registrarEventoLantek({
      modulo,
      tipo: "pesquisa_erp",
      sucesso: false,
      resumo: `Pesquisa no ERP com erro${parametros ? ` (${parametros.valor})` : ""}`,
      parametros,
      duracaoMs: performance.now() - inicio,
      erro: error instanceof Error ? error.message : String(error),
      usuarioId: usuario.id,
      usuarioNome: usuario.nomeExibicao,
    });

    return NextResponse.json(
      { error: "Erro interno ao processar a busca." },
      { status: 500 }
    );
  }
}
