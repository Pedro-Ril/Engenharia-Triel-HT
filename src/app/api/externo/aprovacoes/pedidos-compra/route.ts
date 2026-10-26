import { NextResponse } from "next/server";

import { ValidationError } from "@/lib/auth/errors";
import { optionalInteger } from "@/lib/auth/validation";
import {
  autenticarSistemaExterno,
  lerDesde,
  lerEnvioPedidos,
  listarDecisoesPedidos,
  MAXIMO_DECISOES_POR_CONSULTA,
  registrarPedidosParaAprovacao,
} from "@/lib/aprovacoes/pedidos-compra";
import { registrarLog } from "@/lib/monitoramento/logs";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Chamada pelo SupriConnect (sistema legado de suprimentos) quando o
 * comprador manda pedidos de compra para aprovação. Sem sessão: a rota
 * é pública no proxy (/api/externo) e se autentica pela X-Api-Key.
 *
 * 201 quando algum pedido entrou; 200 quando todos já estavam
 * pendentes. Cada pedido volta com a própria situação.
 */
async function handlePOST(request: Request) {
  const negado = await autenticarSistemaExterno(request);
  if (negado) return negado;

  try {
    const corpo = await request.json().catch(() => {
      throw new ValidationError("Corpo da requisição inválido (JSON esperado).");
    });
    const envio = lerEnvioPedidos(corpo);
    const resultado = await registrarPedidosParaAprovacao(envio);

    const criados = resultado.pedidos.filter((p) => p.situacao === "criado").length;

    if (criados > 0) {
      await registrarLog({
        nivel: "info",
        origem: "aprovacoes/pedidos-compra",
        mensagem: `Aprovação #${resultado.numeroAprovacao}: ${criados} pedido(s) de compra recebido(s) do SupriConnect.`,
        detalhes: JSON.stringify(resultado.pedidos),
        metodo: "POST",
        caminho: new URL(request.url).pathname,
        ipOrigem: request.headers.get("x-forwarded-for"),
      });
    }

    return NextResponse.json(
      { ok: true, data: resultado },
      { status: criados > 0 ? 201 : 200 }
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao receber pedidos de compra para aprovação:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível registrar os pedidos para aprovação." },
      { status: 500 }
    );
  }
}

/*
 * Decisões para o SupriConnect buscar de tempos em tempos:
 * ?desde=<proximoDesde da consulta anterior>&limite=<até 500>.
 * Devolve os pedidos aprovados/reprovados depois de `desde`, do mais
 * antigo para o mais novo, e o `proximoDesde` para a consulta seguinte.
 */
async function handleGET(request: Request) {
  const negado = await autenticarSistemaExterno(request);
  if (negado) return negado;

  try {
    const url = new URL(request.url);
    const limite = optionalInteger(url.searchParams.get("limite"), "limite", MAXIMO_DECISOES_POR_CONSULTA);

    if (limite < 1 || limite > MAXIMO_DECISOES_POR_CONSULTA) {
      throw new ValidationError(`O parâmetro limite deve ficar entre 1 e ${MAXIMO_DECISOES_POR_CONSULTA}.`);
    }

    const decisoes = await listarDecisoesPedidos({ desde: lerDesde(url.searchParams.get("desde")), limite });

    return NextResponse.json({ ok: true, data: decisoes });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao listar as decisões de pedidos de compra:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível consultar as decisões." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("externo/aprovacoes/pedidos-compra", handleGET);
export const POST = comMetricasApi("externo/aprovacoes/pedidos-compra", handlePOST);
