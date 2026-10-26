import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject } from "@/lib/auth/validation";
import { lerChavePedido } from "@/lib/aprovacoes/pedidos-compra";
import { testarConsultaPedidoErp } from "@/lib/aprovacoes/pedidos-compra-admin";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Consulta um pedido real no ERP com a URL salva e devolve a resposta crua. */
async function handlePOST(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const body: unknown = await request.json();
    if (!isObject(body)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }

    const resultado = await testarConsultaPedidoErp(lerChavePedido(body.empresa, body.numero));
    return NextResponse.json({ ok: true, data: resultado });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao testar a consulta de pedido no ERP:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível testar a consulta de pedido no ERP." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("admin/aprovacoes/pedidos-compra/testar", handlePOST);
