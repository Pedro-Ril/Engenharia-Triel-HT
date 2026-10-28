import "server-only";

import { fetchMonitorado } from "@/lib/monitoramento/integracao-externa";
import type {
  ItemPedidoErp,
  ParcelaPedidoErp,
  PedidoCompraErp,
} from "@/modules/aprovacoes/types/aprovacoes.types";

import { buscarConfigPedidosCompra, montarUrlPedido } from "./pedidos-compra-admin";

/*
 * Consulta do pedido de compra na API do ERP (Oracle_Db_FoccoERP,
 * routes/pedidoCompra.js): GET {base}/{cod_emp}/{numero}.
 *
 * A base vem de Administração → Diretoria → Configurações → Pedidos de
 * Compra (produção ou teste). Os parâmetros da URL configurada são
 * mantidos -- a de teste costuma ser a mesma base com ?ambiente=teste.
 */

export class ErroConsultaErp extends Error {}

type Bruto = Record<string, unknown>;

function obj(valor: unknown): Bruto | null {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor) ? (valor as Bruto) : null;
}

function texto(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  const s = String(valor).trim();
  return s ? s : null;
}

function numero(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

function rotulo(valor: unknown): string | null {
  const o = obj(valor);
  if (!o) return texto(valor);
  return texto(o.descricao) ?? texto(o.nome) ?? texto(o.codigo);
}

function normalizarParcela(bruto: unknown): ParcelaPedidoErp | null {
  const p = obj(bruto);
  if (!p) return null;

  return {
    parcela: numero(p.parcela) ?? 0,
    dias: numero(p.dias),
    vencimento: texto(p.vencimento),
    percentual: numero(p.percentual),
    percentualInformado: p.percentualInformado !== false,
    valorEstimado: numero(p.valorEstimado),
  };
}

function normalizarItem(bruto: unknown): ItemPedidoErp | null {
  const i = obj(bruto);
  if (!i) return null;

  const item = obj(i.item);
  const quantidades = obj(i.quantidades);
  const valores = obj(i.valores);
  const datas = obj(i.datas);

  return {
    sequencia: numero(i.sequencia) ?? 0,
    codigo: texto(item?.codigo) ?? "",
    descricao: texto(item?.descricaoNoPedido) ?? texto(item?.descricao) ?? "",
    unidade: texto(i.unidade),
    situacao: texto(i.situacao),
    quantidade: numero(quantidades?.pedida) ?? 0,
    atendida: numero(quantidades?.atendida) ?? 0,
    saldo: numero(quantidades?.saldo) ?? 0,
    precoUnitario: numero(i.precoUnitario) ?? 0,
    percentualIpi: numero(i.percentualIpi),
    total: numero(valores?.total) ?? numero(valores?.liquidoComIpi) ?? 0,
    entrega: texto(datas?.entrega),
    centroCusto: rotulo(i.centroCusto),
    centroCustoCodigo: texto(obj(i.centroCusto)?.codigo),
    observacao: texto(i.observacao),
  };
}

/* A resposta de detalhe pode trazer a capa no topo de `data` ou em `data.capa`: aceita os dois. */
export function normalizarPedidoErp(data: unknown): PedidoCompraErp | null {
  const d = obj(data);
  if (!d) return null;

  const capa = obj(d.capa) ?? d;
  const empresa = obj(capa.empresa);
  const fornecedor = obj(d.fornecedor) ?? obj(capa.fornecedor);
  const comprador = obj(d.comprador) ?? obj(capa.comprador);
  const moeda = obj(d.moeda) ?? obj(capa.moeda);
  const frete = obj(d.frete) ?? obj(capa.frete);
  const pagamento = obj(d.pagamento) ?? obj(capa.pagamento);
  const valores = obj(d.valores) ?? obj(capa.valores) ?? {};
  /* IPI/ICMS do pedido vêm em `impostos`; `valores` só às vezes os repete. */
  const impostos = obj(d.impostos) ?? obj(capa.impostos) ?? {};

  const numeroPedido = numero(capa.numero);
  if (numeroPedido === null) return null;

  const parcelas = Array.isArray(pagamento?.parcelas) ? pagamento.parcelas : [];
  const itens = Array.isArray(d.itens) ? d.itens : [];

  return {
    numero: numeroPedido,
    empresa: {
      codigo: numero(empresa?.codigo) ?? numero(capa.codEmp) ?? 0,
      nome: texto(empresa?.razaoSocial),
    },
    dataEmissao: texto(capa.dataEmissao),
    situacao: texto(capa.situacao)?.toLowerCase() ?? null,
    tipo: rotulo(capa.tipo),
    fornecedor: {
      codigo: numero(fornecedor?.codigo),
      nome: texto(fornecedor?.nome) ?? "(fornecedor sem nome)",
      documento: texto(fornecedor?.cnpj) ?? texto(fornecedor?.cpf),
    },
    comprador: texto(comprador?.nome),
    contato: texto(d.contato) ?? texto(capa.contato),
    moeda: moeda ? (texto(moeda.descricao) ?? texto(moeda.codigo)) : null,
    frete: frete
      ? {
          tipo: rotulo(frete.tipo),
          valor: numero(frete.valor),
          transportadora: texto(obj(frete.transportadora)?.nome),
        }
      : null,
    parcelas: parcelas.map(normalizarParcela).filter((p): p is ParcelaPedidoErp => p !== null),
    valores: {
      bruto: numero(valores.bruto) ?? 0,
      descontos: numero(valores.descontos) ?? 0,
      acrescimos: numero(valores.acrescimos) ?? 0,
      ipi: numero(valores.ipi) ?? numero(impostos.ipi) ?? 0,
      icms: numero(valores.icms) ?? numero(impostos.icms) ?? 0,
      icmsSt: numero(valores.icmsSt) ?? numero(impostos.icmsSt) ?? 0,
      frete: numero(valores.frete) ?? 0,
      total: numero(valores.total) ?? 0,
    },
    observacao: texto(d.observacao) ?? texto(capa.observacao),
    itens: itens.map(normalizarItem).filter((i): i is ItemPedidoErp => i !== null),
  };
}

/*
 * O pedido no ERP, ou null quando o ERP diz que não existe (404 em
 * JSON). Lança ErroConsultaErp quando não deu para saber: integração
 * sem URL, ERP fora do ar, rota ainda não publicada (404 em HTML) ou
 * resposta fora do formato.
 */
export async function consultarPedidoCompraErp(
  empresa: number,
  numeroPedido: number,
  opcoes: { timeoutMs?: number } = {}
): Promise<PedidoCompraErp | null> {
  const config = await buscarConfigPedidosCompra();
  const base = config.usarAmbienteTeste ? config.urlPedidoTeste : config.urlPedido;

  if (!base) {
    throw new ErroConsultaErp(
      "A consulta de pedidos no ERP não está configurada (Administração → Diretoria → Configurações → Pedidos de Compra)."
    );
  }

  let resposta: Response;

  try {
    resposta = await fetchMonitorado(
      montarUrlPedido(base, empresa, numeroPedido),
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          ...(config.chaveApiErp ? { Authorization: `Bearer ${config.chaveApiErp}` } : {}),
        },
        cache: "no-store",
        signal: AbortSignal.timeout(opcoes.timeoutMs ?? 15000),
      },
      { servico: "erp_pedido_compra", moduloChave: "aprovacoes-painel" }
    );
  } catch (error) {
    throw new ErroConsultaErp(
      `O ERP não respondeu à consulta do pedido ${numeroPedido}${error instanceof Error ? ` (${error.message})` : ""}.`
    );
  }

  const corpoTexto = await resposta.text();
  let corpo: Bruto | null = null;

  try {
    corpo = obj(JSON.parse(corpoTexto));
  } catch {
    corpo = null;
  }

  /* 404 em JSON = pedido inexistente; 404 em HTML = rota não existe (API não reiniciada). */
  if (resposta.status === 404 && corpo) return null;

  if (!resposta.ok || !corpo) {
    throw new ErroConsultaErp(
      `A consulta do pedido ${numeroPedido} no ERP falhou (HTTP ${resposta.status}${
        corpo && texto(corpo.message) ? `: ${texto(corpo.message)}` : ""
      }).`
    );
  }

  const pedido = normalizarPedidoErp(corpo.data);
  if (!pedido) {
    throw new ErroConsultaErp(`O ERP devolveu o pedido ${numeroPedido} num formato inesperado.`);
  }

  return pedido;
}
