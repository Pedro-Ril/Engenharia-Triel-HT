import { NextResponse } from "next/server";

import { ValidationError } from "@/lib/auth/errors";
import { requireAtendenteAprovacaoApi } from "@/lib/aprovacoes/autorizacao-aprovacoes";
import { ehEmpresaPedidoCompra } from "@/lib/aprovacoes/empresas-pedido-compra";
import {
  completarFotosFaltantes,
  listarEmpresasDoDiretor,
  listarPedidosPainel,
  type FiltrosPedidosPainel,
} from "@/lib/aprovacoes/pedidos-compra";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const statusValidos: FiltrosPedidosPainel["status"][] = ["pendente", "aprovado", "reprovado", "todos"];

/* Fila de pedidos de compra do diretor logado (aba Pedidos de Compra do painel). */
async function handleGET(request: Request) {
  const acesso = await requireAtendenteAprovacaoApi("pedido_compra");
  if (acesso.negado) return acesso.negado;

  try {
    const parametros = new URL(request.url).searchParams;
    const status = parametros.get("status") as FiltrosPedidosPainel["status"] | null;
    const empresaParam = parametros.get("empresa");
    const empresa = empresaParam ? Number(empresaParam) : null;

    if (empresa !== null && !ehEmpresaPedidoCompra(empresa)) {
      throw new ValidationError("Empresa inválida.");
    }

    const filtros: FiltrosPedidosPainel = {
      status: status && statusValidos.includes(status) ? status : "pendente",
      empresa,
      busca: (parametros.get("busca") ?? "").slice(0, 200),
    };

    const [lista, empresas] = await Promise.all([
      listarPedidosPainel(acesso.usuario.id, filtros),
      listarEmpresasDoDiretor(acesso.usuario.id),
    ]);
    let pedidos = lista;

    /* Pedido sem foto do ERP (envio antigo ou ERP fora do ar): completa agora e relê. */
    if ((await completarFotosFaltantes(pedidos)) > 0) {
      pedidos = await listarPedidosPainel(acesso.usuario.id, filtros);
    }

    return NextResponse.json({ ok: true, data: { pedidos, empresas } });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao listar pedidos de compra do painel:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar os pedidos de compra." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("aprovacoes/pedidos-compra", handleGET);
