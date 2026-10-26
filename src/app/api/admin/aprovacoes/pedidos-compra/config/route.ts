import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalBoolean, optionalText } from "@/lib/auth/validation";
import {
  buscarConfigPedidosCompra,
  salvarConfigPedidosCompra,
} from "@/lib/aprovacoes/pedidos-compra-admin";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Integração dos pedidos de compra: URLs do ERP e situação da chave do SupriConnect. */
async function handleGET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    return NextResponse.json({ ok: true, data: await buscarConfigPedidosCompra() });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao carregar a integração de pedidos de compra:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível carregar a integração de pedidos de compra." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/aprovacoes/pedidos-compra/config", handleGET);

async function handlePUT(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const body: unknown = await request.json();
    if (!isObject(body)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }

    const config = await salvarConfigPedidosCompra(
      {
        urlPedido: optionalText(body.urlPedido, "URL de produção", 300),
        urlPedidoTeste: optionalText(body.urlPedidoTeste, "URL de teste", 300),
        usarAmbienteTeste: optionalBoolean(body.usarAmbienteTeste, "usar ambiente de teste", false),
        chaveApiErp: optionalText(body.chaveApiErp, "chave de API do ERP", 200),
      },
      acesso.usuario.nomeExibicao
    );

    return NextResponse.json({ ok: true, message: "Integração salva.", data: config });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao salvar a integração de pedidos de compra:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível salvar a integração de pedidos de compra." },
      { status: 500 }
    );
  }
}

export const PUT = comMetricasApi("admin/aprovacoes/pedidos-compra/config", handlePUT);
