import { NextResponse } from "next/server";

import { ValidationError } from "@/lib/auth/errors";
import { isObject, requiredUuidArray } from "@/lib/auth/validation";
import { requireAtendenteAprovacaoApi } from "@/lib/aprovacoes/autorizacao-aprovacoes";
import { buscarDirecionamentosPedidos, MAXIMO_PEDIDOS_DIRECIONAMENTO } from "@/lib/aprovacoes/pedidos-compra";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Antes de aprovar: para os pedidos marcados que estão na vez do
 * usuário e têm um próximo nível, quem desse nível pode receber o
 * direcionamento e quem a regra da alçada sugere. POST só porque a
 * lista de ids pode ser longa -- não grava nada (exceto completar os
 * centros de custo da foto, quando faltam).
 */
async function handlePOST(request: Request) {
  const acesso = await requireAtendenteAprovacaoApi("pedido_compra");
  if (acesso.negado) return acesso.negado;

  try {
    const body: unknown = await request.json();
    if (!isObject(body)) throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");

    const ids = requiredUuidArray(body.ids, "pedidos");
    if (ids.length > MAXIMO_PEDIDOS_DIRECIONAMENTO) {
      throw new ValidationError(`Selecione no máximo ${MAXIMO_PEDIDOS_DIRECIONAMENTO} pedidos por vez.`);
    }

    const direcionamentos = await buscarDirecionamentosPedidos(ids, acesso.usuario.id);
    return NextResponse.json({ ok: true, data: direcionamentos });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao buscar o direcionamento dos pedidos:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível buscar para quem direcionar os pedidos." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("aprovacoes/pedidos-compra/direcionamento", handlePOST);
