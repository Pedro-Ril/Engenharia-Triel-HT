import { NextResponse } from "next/server";

import { ValidationError } from "@/lib/auth/errors";
import { requireAtendenteAprovacaoApi } from "@/lib/aprovacoes/autorizacao-aprovacoes";
import { lerPrefixos } from "@/lib/aprovacoes/alcadas/regras";
import { ehEmpresaPedidoCompra } from "@/lib/aprovacoes/empresas-pedido-compra";
import {
  buscarDirecionamentosPedidos,
  completarFotosFaltantes,
  MAXIMO_PEDIDOS_DIRECIONAMENTO,
  iniciarFluxosSemEtapa,
  listarPedidosPainel,
  type FiltrosPedidosPainel,
} from "@/lib/aprovacoes/pedidos-compra";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const statusValidos: FiltrosPedidosPainel["status"][] = ["pendente", "aprovado", "devolvido", "reprovado", "todos"];

/* Período do histórico: 7, 30, 90 ou 365 dias; "tudo" (ou vazio) = sem corte. */
function lerDias(valor: string | null): number | null {
  const dias = Number(valor);
  return [7, 30, 90, 365].includes(dias) ? dias : null;
}

/*
 * Pedidos de compra do usuário logado (aba Pedidos de Compra do painel):
 * "pendente" é a fila da vez dele; os outros filtros, o que já passou
 * pelo nível dele. Filtra por empresa, centro de custo (prefixos) e
 * busca -- com "marcar todos" + Aprovar, é o direcionamento em lote.
 */
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
      /* "90.02, 90.90" -> ["9002", "9090"]: algum item num desses centros de custo. */
      centrosCusto: lerPrefixos((parametros.get("centroCusto") ?? "").slice(0, 200)).slice(0, 10),
      dias: lerDias(parametros.get("dias")),
    };

    /* Pendentes de antes das alçadas entram no nível 1 assim que a alçada existe. */
    await iniciarFluxosSemEtapa();

    let pedidos = await listarPedidosPainel(acesso.usuario.id, filtros);

    /* Pedido sem foto do ERP (envio antigo ou ERP fora do ar): completa agora e relê. */
    if ((await completarFotosFaltantes(pedidos)) > 0) {
      pedidos = await listarPedidosPainel(acesso.usuario.id, filtros);
    }

    /* Para onde cada pedido da vez vai ao aprovar (o resumo por destino e a coluna "Vai para"). */
    const daVez = pedidos.filter((pedido) => pedido.naMinhaVez).map((pedido) => pedido.id);
    const destinos = new Map<string, NonNullable<(typeof pedidos)[number]["vaiPara"]>>();
    for (let inicio = 0; inicio < daVez.length; inicio += MAXIMO_PEDIDOS_DIRECIONAMENTO) {
      const bloco = daVez.slice(inicio, inicio + MAXIMO_PEDIDOS_DIRECIONAMENTO);
      for (const d of await buscarDirecionamentosPedidos(bloco, acesso.usuario.id, { completarNoErp: false })) {
        destinos.set(d.itemId.toUpperCase(), { proximoNivel: d.proximoNivel, pessoa: d.sugestao });
      }
    }
    pedidos = pedidos.map((pedido) =>
      pedido.naMinhaVez ? { ...pedido, vaiPara: destinos.get(pedido.id.toUpperCase()) ?? null } : pedido
    );

    return NextResponse.json({ ok: true, data: { pedidos } });
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
