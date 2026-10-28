import "server-only";

import { NextResponse } from "next/server";

import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalText } from "@/lib/auth/validation";
import { getSqlServerPool, sql } from "@/lib/database/sql-server";

import type { PedidoCompraErp } from "@/modules/aprovacoes/types/aprovacoes.types";
import { registrarLog } from "@/lib/monitoramento/logs";

import { nomeEmpresaPedidoCompra } from "./empresas-pedido-compra";
import {
  buscarDirecionamentosDaVez,
  buscarFluxoDoItem,
  decidirEtapa,
  iniciarFluxo,
  sqlColunasNivelAtual,
  sqlNaVezDoUsuario,
  sqlParticipaDaCadeia,
  sqlSemCadeia,
  type DirecionamentoDaVez,
  type EtapaDoItem,
  type EventoHistorico,
} from "./alcadas/fluxo";
import type { AcaoEtapa } from "./alcadas/regras";
import { consultarPedidoCompraErp, ErroConsultaErp } from "./pedido-compra-erp";
import { conferirChaveExterna } from "./pedidos-compra-admin";

/*
 * Pedidos de compra mandados para aprovação pelo sistema legado
 * (SupriConnect). O pedido nasce no Focco; o comprador escolhe no
 * legado quais enviar, e o legado chama o portal só com a chave de cada
 * um (empresa + número). Fornecedor, itens e valores o portal busca no
 * ERP quando for mostrar -- aqui fica só a chave e a decisão.
 *
 * Um envio é um lote (dbo.portal_aprovacoes, tipo "pedido_compra") e
 * cada pedido um item com decisão própria, como no reajuste salarial.
 */

export const TIPO_PEDIDO_COMPRA = "pedido_compra";
export const ORIGEM_SUPRICONNECT = "supriconnect";

/* Teto por envio: cada pedido é uma linha e uma decisão no painel. */
export const MAXIMO_PEDIDOS_POR_ENVIO = 200;

/*
 * O legado não tem login: quem chama é o sistema, identificado pela
 * chave no cabeçalho X-Api-Key -- gerada em Administração → Diretoria →
 * Pedidos de Compra (no banco fica só o hash). Sem chave gerada, a
 * integração fica desligada. Devolve a recusa pronta, ou null quando
 * a chave confere.
 */
export async function autenticarSistemaExterno(request: Request): Promise<NextResponse | null> {
  const situacao = await conferirChaveExterna(request.headers.get("x-api-key")?.trim() ?? "");

  if (situacao === "nao_configurada") {
    return NextResponse.json(
      { ok: false, message: "A integração de pedidos de compra não está configurada no portal." },
      { status: 503 }
    );
  }

  if (situacao === "invalida") {
    return NextResponse.json({ ok: false, message: "Chave de API inválida." }, { status: 401 });
  }

  return null;
}

export interface ChavePedido {
  empresa: number;
  numero: number;
}

/* Pedido como chega no envio: a chave e, se o comprador escolheu, o diretor (login do AD). */
export interface PedidoEnviado extends ChavePedido {
  aprovador: string | null;
}

export interface AprovadorPedidoCompra {
  login: string;
  nome: string;
  email: string | null;
}


export type SituacaoEnvio = "criado" | "ja_pendente";

export interface ResultadoEnvioPedido extends ChavePedido {
  situacao: SituacaoEnvio;
  /* Diretor a quem o pedido está direcionado; null = qualquer aprovador. */
  aprovador: AprovadorPedidoCompra | null;
  /* Número da aprovação no portal (o lote) em que o pedido está pendente. */
  numeroAprovacao: number;
}

export interface ResultadoEnvio {
  /* Lote criado neste envio; null quando todos já estavam pendentes. */
  numeroAprovacao: number | null;
  pedidos: ResultadoEnvioPedido[];
}

/* Inteiro positivo; aceita "123" também, já que o legado pode mandar texto. */
function inteiroPositivo(valor: unknown, campo: string): number {
  const numero = typeof valor === "string" && /^\d+$/.test(valor.trim()) ? Number(valor.trim()) : valor;

  if (typeof numero !== "number" || !Number.isSafeInteger(numero) || numero <= 0) {
    throw new ValidationError(`O campo ${campo} deve ser um número inteiro positivo.`);
  }

  return numero;
}

export function lerChavePedido(empresa: unknown, numero: unknown): ChavePedido {
  return {
    empresa: inteiroPositivo(empresa, "empresa"),
    numero: inteiroPositivo(numero, "numero"),
  };
}

function lerLogin(valor: unknown, campo: string): string | null {
  const login = optionalText(valor, campo, 100);
  return login ? login.toLowerCase() : null;
}

/*
 * Corpo do POST:
 * { enviadoPor?, observacao?, aprovador?, pedidos: [{ empresa, numero, aprovador? }] }
 * `aprovador` é o login do diretor; o do pedido vale sobre o do envio.
 */
export function lerEnvioPedidos(corpo: unknown): {
  enviadoPor: string | null;
  observacao: string | null;
  pedidos: PedidoEnviado[];
} {
  if (!isObject(corpo)) throw new ValidationError("Corpo da requisição inválido.");

  if (!Array.isArray(corpo.pedidos) || corpo.pedidos.length === 0) {
    throw new ValidationError("Informe ao menos um pedido em pedidos.");
  }

  const vistos = new Set<string>();
  const pedidos: PedidoEnviado[] = [];
  const aprovadorDoEnvio = lerLogin(corpo.aprovador, "aprovador");

  corpo.pedidos.forEach((item, indice) => {
    if (!isObject(item)) throw new ValidationError(`O pedido na posição ${indice + 1} é inválido.`);
    const chave = lerChavePedido(item.empresa, item.numero);
    const id = `${chave.empresa}-${chave.numero}`;

    /* O mesmo pedido duas vezes na lista conta uma vez só. */
    if (!vistos.has(id)) {
      vistos.add(id);
      pedidos.push({ ...chave, aprovador: lerLogin(item.aprovador, "aprovador") ?? aprovadorDoEnvio });
    }
  });

  if (pedidos.length > MAXIMO_PEDIDOS_POR_ENVIO) {
    throw new ValidationError(`Envie no máximo ${MAXIMO_PEDIDOS_POR_ENVIO} pedidos por vez.`);
  }

  return {
    enviadoPor: optionalText(corpo.enviadoPor, "enviadoPor", 200),
    observacao: optionalText(corpo.observacao, "observacao", 2000),
    pedidos,
  };
}

/* Quantas consultas ao ERP correm ao mesmo tempo num envio grande. */
const CONSULTAS_ERP_SIMULTANEAS = 6;

function chaveDoPedido(pedido: ChavePedido): string {
  return `${pedido.empresa}-${pedido.numero}`;
}

/* A data existe no calendário (31/02 não, 29/02 só em ano bissexto). */
function dataExiste(ano: number, mes: number, dia: number): boolean {
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
}

/*
 * "DD/MM/YYYY" do ERP -> "YYYY-MM-DD" para a coluna DATE; null se vier
 * fora do formato ou com data que não existe -- uma data inválida
 * chegando ao banco derrubaria a gravação do envio inteiro.
 */
export function dataIso(valor: string | null): string | null {
  const partes = valor ? /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(valor.trim()) : null;
  if (!partes) return null;
  if (!dataExiste(Number(partes[3]), Number(partes[2]), Number(partes[1]))) return null;
  return `${partes[3]}-${partes[2]}-${partes[1]}`;
}

/* Resumo das parcelas: "À vista", "30 dias", "30/60/90 dias", "Entrada + 30/60 dias". */
export function resumirPagamento(erp: Pick<PedidoCompraErp, "parcelas">): string | null {
  const dias = erp.parcelas.map((parcela) => parcela.dias).filter((d): d is number => d !== null);
  if (dias.length === 0) return null;

  const prazos = dias.filter((d) => d > 0);
  const temEntrada = prazos.length < dias.length;

  if (prazos.length === 0) return "À vista";
  return `${temEntrada ? "Entrada + " : ""}${prazos.join("/")} dias`;
}

/* Código do centro de custo de cada item, separados por vírgula (vazio = item sem centro de custo). */
export function centrosCustoDosItens(erp: Pick<PedidoCompraErp, "itens">): string {
  return erp.itens.map((item) => item.centroCustoCodigo ?? "").join(",");
}

/* A primeira entrega entre os itens, em ISO. */
export function primeiraEntrega(erp: Pick<PedidoCompraErp, "itens">): string | null {
  const datas = erp.itens
    .map((item) => dataIso(item.entrega))
    .filter((d): d is string => d !== null)
    .sort();
  return datas[0] ?? null;
}

/* O que fica gravado do ERP no item: o que a lista mostra e o que serve para comparar depois. */
function parametrosDaFoto(request: sql.Request, erp: PedidoCompraErp | null): sql.Request {
  return request
    .input("fornecedorCodigo", sql.Int, erp?.fornecedor.codigo ?? null)
    .input("fornecedorNome", sql.NVarChar(200), erp?.fornecedor.nome.slice(0, 200) ?? null)
    .input("compradorNome", sql.NVarChar(200), erp?.comprador?.slice(0, 200) ?? null)
    .input("dataEmissao", sql.Date, dataIso(erp?.dataEmissao ?? null))
    .input("valorTotal", sql.Decimal(18, 2), erp ? erp.valores.total : null)
    .input("moeda", sql.NVarChar(60), erp?.moeda?.slice(0, 60) ?? null)
    .input("situacaoErp", sql.VarChar(20), erp?.situacao?.slice(0, 20) ?? null)
    .input("quantidadeItens", sql.Int, erp ? erp.itens.length : null)
    .input("condicaoPagamento", sql.NVarChar(120), erp ? (resumirPagamento(erp)?.slice(0, 120) ?? null) : null)
    .input("entregaPrevista", sql.Date, erp ? primeiraEntrega(erp) : null)
    .input("centrosCustoItens", sql.NVarChar(sql.MAX), erp ? centrosCustoDosItens(erp) : null);
}

/*
 * Confere cada pedido no ERP e devolve a foto de cada um.
 *
 * - Não existe no Focco, ou está cancelado: o envio inteiro é recusado
 *   (400), com os números na mensagem -- mesma regra tudo-ou-nada do
 *   diretor inválido.
 * - ERP fora do ar ou sem URL configurada: o envio segue sem a foto,
 *   para não travar o comprador. Fica registrado no log; o detalhe no
 *   painel busca ao vivo de qualquer jeito.
 */
export async function conferirNoErp(pedidos: PedidoEnviado[]): Promise<Map<string, PedidoCompraErp>> {
  const fotos = new Map<string, PedidoCompraErp>();
  const inexistentes: PedidoEnviado[] = [];
  const cancelados: PedidoEnviado[] = [];
  let falha: string | null = null;

  for (let inicio = 0; inicio < pedidos.length; inicio += CONSULTAS_ERP_SIMULTANEAS) {
    const bloco = pedidos.slice(inicio, inicio + CONSULTAS_ERP_SIMULTANEAS);

    await Promise.all(
      bloco.map(async (pedido) => {
        try {
          const erp = await consultarPedidoCompraErp(pedido.empresa, pedido.numero, { timeoutMs: 10000 });

          if (!erp) inexistentes.push(pedido);
          else if (erp.situacao === "cancelado") cancelados.push(pedido);
          else fotos.set(chaveDoPedido(pedido), erp);
        } catch (error) {
          if (!(error instanceof ErroConsultaErp)) throw error;
          falha ??= error.message;
        }
      })
    );

    /* ERP falhando: não espera o timeout de cada bloco que falta. Os que já responderam ficam com a foto. */
    if (falha) break;
  }

  const listar = (lista: PedidoEnviado[]) =>
    lista
      .slice(0, 10)
      .map((p) => `${p.numero} (${nomeEmpresaPedidoCompra(p.empresa)})`)
      .join(", ") + (lista.length > 10 ? "…" : "");

  if (inexistentes.length > 0) {
    throw new ValidationError(`Pedido(s) não encontrado(s) no Focco: ${listar(inexistentes)}.`);
  }

  if (cancelados.length > 0) {
    throw new ValidationError(`Pedido(s) cancelado(s) no Focco não podem ir para aprovação: ${listar(cancelados)}.`);
  }

  if (falha) {
    await registrarLog({
      nivel: "aviso",
      origem: "aprovacoes/pedidos-compra",
      mensagem: `Pedidos de compra recebidos sem conferência completa no ERP: ${pedidos.length - fotos.size} de ${pedidos.length} seguiram sem a foto do pedido.`,
      detalhes: falha,
    });
  }

  return fotos;
}

const VIOLACAO_UNICA = new Set([2601, 2627]);

function ehViolacaoUnica(erro: unknown): boolean {
  const numero = (erro as { number?: number; originalError?: { info?: { number?: number } } })?.number
    ?? (erro as { originalError?: { info?: { number?: number } } })?.originalError?.info?.number;
  return typeof numero === "number" && VIOLACAO_UNICA.has(numero);
}

async function tentarRegistrar(
  params: {
    enviadoPor: string | null;
    observacao: string | null;
    pedidos: PedidoEnviado[];
  },
  fotos: Map<string, PedidoCompraErp>
): Promise<ResultadoEnvio> {
  const pool = await getSqlServerPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const resultados: ResultadoEnvioPedido[] = [];
    const novos: PedidoEnviado[] = [];

    for (const pedido of params.pedidos) {
      /* UPDLOCK/HOLDLOCK: outro envio do mesmo pedido espera esta transação. */
      const pendente = await new sql.Request(transaction)
        .input("empresa", sql.Int, pedido.empresa)
        .input("numero", sql.BigInt, pedido.numero)
        .query<{ numero_aprovacao: number }>(`
          SELECT TOP 1 a.[numero] AS [numero_aprovacao]
          FROM dbo.portal_aprovacoes_pedido_compra AS p WITH (UPDLOCK, HOLDLOCK)
          INNER JOIN dbo.portal_aprovacoes AS a ON a.[id] = p.[aprovacao_id]
          WHERE p.[empresa] = @empresa AND p.[numero_pedido] = @numero AND p.[status] = 'pendente';
        `);

      const existente = pendente.recordset[0];

      /* Já pendente: segue na cadeia em que está. */
      if (existente) {
        resultados.push({
          empresa: pedido.empresa,
          numero: pedido.numero,
          situacao: "ja_pendente",
          aprovador: null,
          numeroAprovacao: existente.numero_aprovacao,
        });
      } else {
        novos.push(pedido);
      }
    }

    let numeroAprovacao: number | null = null;

    if (novos.length > 0) {
      const lote = await new sql.Request(transaction)
        .input("tipo", sql.VarChar(40), TIPO_PEDIDO_COMPRA)
        .input("origem", sql.VarChar(40), ORIGEM_SUPRICONNECT)
        .input("observacao", sql.NVarChar(2000), params.observacao)
        /* Sem login no legado: o nome é o que ele mandar, ou o próprio sistema. */
        .input("criadoPorNome", sql.NVarChar(200), params.enviadoPor || "SupriConnect")
        .query<{ id: string; numero: number }>(`
          INSERT INTO dbo.portal_aprovacoes ([tipo], [origem], [observacao], [criado_por_usuario_id], [criado_por_nome])
          OUTPUT CONVERT(VARCHAR(36), INSERTED.[id]) AS [id], INSERTED.[numero] AS [numero]
          VALUES (@tipo, @origem, @observacao, NULL, @criadoPorNome);
        `);

      const aprovacaoId = lote.recordset[0].id;
      numeroAprovacao = lote.recordset[0].numero;

      for (const pedido of novos) {
        const foto = fotos.get(chaveDoPedido(pedido)) ?? null;

        const inserido = await parametrosDaFoto(new sql.Request(transaction), foto)
          .input("aprovacaoId", sql.UniqueIdentifier, aprovacaoId)
          .input("empresa", sql.Int, pedido.empresa)
          .input("numero", sql.BigInt, pedido.numero)
          .query<{ id: string }>(`
            INSERT INTO dbo.portal_aprovacoes_pedido_compra
              ([aprovacao_id], [empresa], [numero_pedido],
               [fornecedor_codigo], [fornecedor_nome], [comprador_nome], [data_emissao], [valor_total],
               [moeda], [situacao_erp], [quantidade_itens], [condicao_pagamento], [entrega_prevista],
               [centros_custo_itens], [snapshot_em])
            OUTPUT CONVERT(VARCHAR(36), INSERTED.[id]) AS [id]
            VALUES (@aprovacaoId, @empresa, @numero,
               @fornecedorCodigo, @fornecedorNome, @compradorNome, @dataEmissao, @valorTotal,
               @moeda, @situacaoErp, @quantidadeItens, @condicaoPagamento, @entregaPrevista,
               @centrosCustoItens, CASE WHEN @fornecedorNome IS NULL THEN NULL ELSE SYSDATETIME() END);
          `);

        /*
         * Entra na cadeia da alçada da empresa. Sem alçada (ou com nível
         * sem aprovador), a ValidationError desfaz o envio inteiro -- o
         * mesmo tudo-ou-nada do resto da validação.
         */
        await iniciarFluxo(transaction, {
          tipo: TIPO_PEDIDO_COMPRA,
          itemId: inserido.recordset[0].id,
          contexto: { empresa: pedido.empresa, setor: null },
          usuario: { id: null, nome: params.enviadoPor || "SupriConnect" },
          comentario: params.observacao,
          nomeEmpresa: nomeEmpresaPedidoCompra,
        });

        resultados.push({
          empresa: pedido.empresa,
          numero: pedido.numero,
          situacao: "criado",
          aprovador: null,
          numeroAprovacao,
        });
      }
    }

    await transaction.commit();

    /* Mesma ordem em que vieram, para o legado casar a resposta com a lista dele. */
    const ordem = (p: ChavePedido) =>
      params.pedidos.findIndex((x) => x.empresa === p.empresa && x.numero === p.numero);
    resultados.sort((a, b) => ordem(a) - ordem(b));

    return { numeroAprovacao, pedidos: resultados };
  } catch (error) {
    await transaction.rollback().catch(() => {});
    throw error;
  }
}

/*
 * Grava os pedidos como pendentes, cada um na cadeia da alçada da sua
 * empresa. Pedido que já está pendente não duplica: volta como
 * "ja_pendente". Pedido devolvido (ou já decidido) que chega de novo
 * abre uma aprovação nova, do nível 1 -- o histórico da anterior fica.
 *
 * O campo `aprovador` do envio não tem mais efeito: quem decide é a
 * alçada (Administração → Diretoria → Alçadas).
 */
export async function registrarPedidosParaAprovacao(params: {
  enviadoPor: string | null;
  observacao: string | null;
  pedidos: PedidoEnviado[];
}): Promise<ResultadoEnvio> {
  const fotos = await conferirNoErp(params.pedidos);

  try {
    return await tentarRegistrar(params, fotos);
  } catch (error) {
    /* Dois envios do mesmo pedido ao mesmo tempo: o índice único segura um,
       e a segunda tentativa já o encontra pendente. */
    if (ehViolacaoUnica(error)) return tentarRegistrar(params, fotos);
    throw error;
  }
}

/* "reprovado" só existe em pedidos decididos antes das alçadas; hoje a negativa é "devolvido". */
export type SituacaoPedido = "nao_enviado" | "pendente" | "aprovado" | "devolvido" | "reprovado";

/* Onde o pedido pendente está na cadeia: "nível 2 de 3 · Diretoria". */
export interface NivelAtual {
  ordem: number;
  total: number;
  nome: string;
  /* O nível foi direcionado a esta pessoa (só ela decide). */
  direcionadoPara: string | null;
}

export interface ConsultaSituacaoPedido extends ChavePedido {
  situacao: SituacaoPedido;
  numeroAprovacao: number | null;
  /* Diretor a quem foi direcionado; null = qualquer aprovador. */
  aprovador: AprovadorPedidoCompra | null;
  enviadoEm: string | null;
  enviadoPor: string | null;
  decididoPor: string | null;
  decididoEm: string | null;
  comentario: string | null;
  /* Quantas vezes o pedido já foi mandado para aprovação. */
  envios: number;
  /* Só para pendente: em que nível está. */
  nivelAtual: NivelAtual | null;
}

interface LinhaSituacao {
  empresa: number;
  numero_pedido: number | string;
  status: SituacaoPedido;
  numero_aprovacao: number;
  aprovador_login: string | null;
  aprovador_nome: string | null;
  aprovador_email: string | null;
  enviado_em: string;
  enviado_por: string;
  decidido_por_nome: string | null;
  decidido_em: string | null;
  comentario_decisao: string | null;
  envios: number;
  nivel_ordem: number | null;
  nivel_nome: string | null;
  nivel_total: number | null;
  nivel_direcionado: string | null;
}

/* Nível pendente da cadeia atual do item `p` (ou NULL quando não está pendente). */
const colunasNivelAtual = sqlColunasNivelAtual("p.[id]");

function nivelAtualDe(linha: {
  nivel_ordem: number | null;
  nivel_nome: string | null;
  nivel_total: number | null;
  nivel_direcionado: string | null;
}): NivelAtual | null {
  return linha.nivel_ordem !== null && linha.nivel_nome
    ? {
        ordem: linha.nivel_ordem,
        total: linha.nivel_total ?? linha.nivel_ordem,
        nome: linha.nivel_nome,
        direcionadoPara: linha.nivel_direcionado,
      }
    : null;
}

/* Datas sem fuso, no horário do servidor. */
const colunasSituacao = `
  p.[empresa],
  p.[numero_pedido],
  p.[status],
  a.[numero] AS [numero_aprovacao],
  LOWER(ua.[sam_account_name]) AS [aprovador_login],
  p.[aprovador_nome],
  ua.[email] AS [aprovador_email],
  CONVERT(VARCHAR(33), p.[criado_em], 126) AS [enviado_em],
  a.[criado_por_nome] AS [enviado_por],
  p.[decidido_por_nome],
  CONVERT(VARCHAR(33), p.[decidido_em], 126) AS [decidido_em],
  p.[comentario_decisao],
  ${colunasNivelAtual}
`;

const juncoesSituacao = `
  FROM dbo.portal_aprovacoes_pedido_compra AS p
  INNER JOIN dbo.portal_aprovacoes AS a ON a.[id] = p.[aprovacao_id]
  LEFT JOIN dbo.portal_usuarios AS ua ON ua.[id] = p.[aprovador_usuario_id]
`;

function paraSituacao(linha: LinhaSituacao): ConsultaSituacaoPedido {
  return {
    empresa: linha.empresa,
    /* BIGINT vem como texto do driver; o cod_pedc cabe folgado num number. */
    numero: Number(linha.numero_pedido),
    situacao: linha.status,
    numeroAprovacao: linha.numero_aprovacao,
    aprovador:
      linha.aprovador_login && linha.aprovador_nome
        ? { login: linha.aprovador_login, nome: linha.aprovador_nome, email: linha.aprovador_email }
        : null,
    enviadoEm: linha.enviado_em,
    enviadoPor: linha.enviado_por,
    decididoPor: linha.decidido_por_nome,
    decididoEm: linha.decidido_em,
    comentario: linha.comentario_decisao,
    envios: linha.envios,
    nivelAtual: nivelAtualDe(linha),
  };
}

/* Situação do envio mais recente do pedido -- o que o legado consulta. */
export async function buscarSituacaoPedido(chave: ChavePedido): Promise<ConsultaSituacaoPedido> {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("empresa", sql.Int, chave.empresa)
    .input("numero", sql.BigInt, chave.numero)
    .query<LinhaSituacao>(`
      SELECT TOP 1 ${colunasSituacao}, COUNT(*) OVER () AS [envios]
      ${juncoesSituacao}
      WHERE p.[empresa] = @empresa AND p.[numero_pedido] = @numero
      ORDER BY p.[criado_em] DESC;
    `);

  const linha = result.recordset[0];

  if (!linha) {
    return {
      ...chave,
      situacao: "nao_enviado",
      numeroAprovacao: null,
      aprovador: null,
      enviadoEm: null,
      enviadoPor: null,
      decididoPor: null,
      decididoEm: null,
      comentario: null,
      envios: 0,
      nivelAtual: null,
    };
  }

  return paraSituacao(linha);
}

export const MAXIMO_DECISOES_POR_CONSULTA = 500;

export interface ConsultaDecisoes {
  pedidos: ConsultaSituacaoPedido[];
  /* Mande no próximo `desde`; null quando não veio nada (mantenha o atual). */
  proximoDesde: string | null;
}

/*
 * Pedidos decididos (aprovados ou devolvidos) depois de `desde` -- o
 * legado consulta de tempos em tempos e guarda o `proximoDesde`. Sem
 * `desde`, começa pelas decisões mais antigas.
 *
 * WITH TIES: decisões em lote saem com o mesmo horário, e cortar no
 * meio de um empate faria o resto sumir na consulta seguinte (> desde).
 */
export async function listarDecisoesPedidos(params: {
  desde: string | null;
  limite: number;
}): Promise<ConsultaDecisoes> {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("desde", sql.VarChar(33), params.desde)
    .input("limite", sql.Int, params.limite)
    .query<LinhaSituacao>(`
      SELECT TOP (@limite) WITH TIES ${colunasSituacao},
        (
          SELECT COUNT(*) FROM dbo.portal_aprovacoes_pedido_compra AS e
          WHERE e.[empresa] = p.[empresa] AND e.[numero_pedido] = p.[numero_pedido]
        ) AS [envios]
      ${juncoesSituacao}
      WHERE p.[decidido_em] IS NOT NULL
        AND p.[status] IN ('aprovado', 'devolvido', 'reprovado')
        AND (@desde IS NULL OR p.[decidido_em] > CONVERT(DATETIME2, @desde, 126))
      ORDER BY p.[decidido_em];
    `);

  const pedidos = result.recordset.map(paraSituacao);

  return {
    pedidos,
    proximoDesde: pedidos.length > 0 ? pedidos[pedidos.length - 1].decididoEm : null,
  };
}

/* `desde` no formato que o próprio portal devolve (ISO, sem fuso). */
export function lerDesde(valor: string | null): string | null {
  if (!valor || !valor.trim()) return null;
  const texto = valor.trim();

  const partes = /^(\d{4})-(\d{2})-(\d{2})(T(\d{2}):(\d{2})(:(\d{2})(\.\d{1,7})?)?)?$/.exec(texto);

  /* Formato certo com data impossível (2026-13-45) passava e virava 500 no SQL Server. */
  const valida =
    partes !== null &&
    dataExiste(Number(partes[1]), Number(partes[2]), Number(partes[3])) &&
    (partes[5] === undefined || Number(partes[5]) <= 23) &&
    (partes[6] === undefined || Number(partes[6]) <= 59) &&
    (partes[8] === undefined || Number(partes[8]) <= 59);

  if (!valida) {
    throw new ValidationError("O parâmetro desde deve ser uma data ISO válida, ex.: 2026-10-26T08:30:00.");
  }

  return texto;
}

/* ---------------------------------------------------------------
   Painel de Aprovações (quem decide, logado no portal)
   --------------------------------------------------------------- */

/* É a vez do usuário decidir o pedido `p` (o nível pendente da cadeia é o dele). */
const naMinhaVez = sqlNaVezDoUsuario("p.[id]");

/*
 * O usuário enxerga o pedido `p`: a cadeia já chegou ao nível dele. Os
 * decididos antes das alçadas (sem etapas) aparecem só para quem decidiu.
 */
const visivelParaMim = `(
  ${sqlParticipaDaCadeia("p.[id]")}
  OR (
    ${sqlSemCadeia("p.[id]")}
    AND p.[decidido_por_usuario_id] = @usuarioId
  )
)`;

export interface PedidoCompraPainel {
  id: string;
  numeroAprovacao: number;
  empresa: number;
  empresaNome: string;
  numero: number;
  status: Exclude<SituacaoPedido, "nao_enviado">;
  enviadoPor: string;
  enviadoEm: string;
  observacao: string | null;
  aprovadorNome: string | null;
  decididoPor: string | null;
  decididoEm: string | null;
  comentario: string | null;
  fornecedorNome: string | null;
  compradorNome: string | null;
  valorTotal: number | null;
  moeda: string | null;
  /* ISO (YYYY-MM-DD). */
  dataEmissao: string | null;
  situacaoErp: string | null;
  quantidadeItens: number | null;
  condicaoPagamento: string | null;
  entregaPrevista: string | null;
  /* false = o pedido ainda não tem a foto do ERP (envio antigo ou ERP fora do ar). */
  temFoto: boolean;
  /* Código do centro de custo dos itens, sem repetir, na ordem dos itens; null = ainda não sabemos (foto antiga). */
  centrosCusto: string[] | null;
  /*
   * Sem foto -- ou pendente sem os centros de custo -- e sem tentativa
   * recente: a lista pode consultar o ERP para completar.
   */
  podeCompletarFoto: boolean;
  /* É a vez do usuário decidir (o nível pendente é o dele). */
  naMinhaVez: boolean;
  nivelAtual: NivelAtual | null;
  /*
   * Na vez do usuário: para onde o pedido vai ao aprovar, pela sugestão
   * das regras (pessoa null = todos do próximo nível). null = o usuário
   * é o último nível (aprova em definitivo). Ausente fora da vez dele.
   */
  vaiPara?: { proximoNivel: string; pessoa: { id: string; nome: string } | null } | null;
}

export interface FiltrosPedidosPainel {
  /* "pendente" = na minha vez; os demais mostram o histórico do que chegou ao meu nível. */
  status: Exclude<SituacaoPedido, "nao_enviado"> | "todos";
  empresa: number | null;
  /* Número do pedido, nome de quem enviou ou do fornecedor. */
  busca: string;
  /* Um item só (detalhe do painel). */
  id?: string;
  /* Prefixos de centro de custo, só dígitos ("9002"): o pedido entra se tiver algum item num deles. */
  centrosCusto?: string[];
  /*
   * Histórico (todos os filtros menos "pendente"): só o que foi decidido --
   * ou enviado, se ainda está em andamento -- nos últimos N dias. A fila
   * da vez nunca é cortada por data.
   */
  dias?: number | null;
}

export async function listarPedidosPainel(
  usuarioId: string,
  filtros: FiltrosPedidosPainel
): Promise<PedidoCompraPainel[]> {
  const pool = await getSqlServerPool();
  const busca = filtros.busca.trim();
  const prefixos = filtros.centrosCusto ?? [];

  const request = pool.request();
  /* ",9002204,9090582" LIKE "%,9002%": algum item começa com o prefixo. */
  prefixos.forEach((prefixo, i) => request.input(`cc${i}`, sql.VarChar(40), `%,${prefixo}%`));
  const filtroCentroCusto = prefixos.length
    ? `AND (${prefixos.map((_, i) => `(',' + ISNULL(p.[centros_custo_itens], '')) LIKE @cc${i}`).join(" OR ")})`
    : "";

  const result = await request
    .input("dias", sql.Int, filtros.status === "pendente" ? null : (filtros.dias ?? null))
    .input("usuarioId", sql.UniqueIdentifier, usuarioId)
    .input("status", sql.VarChar(20), filtros.status === "todos" ? "" : filtros.status)
    .input("empresa", sql.Int, filtros.empresa)
    .input("busca", sql.NVarChar(200), busca)
    .input("buscaLike", sql.NVarChar(204), `%${busca}%`)
    .input("id", sql.UniqueIdentifier, filtros.id ?? null)
    .query<{
      id: string;
      numero_aprovacao: number;
      empresa: number;
      numero_pedido: number | string;
      status: PedidoCompraPainel["status"];
      enviado_por: string;
      enviado_em: string;
      observacao: string | null;
      aprovador_nome: string | null;
      decidido_por_nome: string | null;
      decidido_em: string | null;
      comentario_decisao: string | null;
      fornecedor_nome: string | null;
      comprador_nome: string | null;
      valor_total: number | string | null;
      moeda: string | null;
      data_emissao: string | null;
      situacao_erp: string | null;
      quantidade_itens: number | null;
      condicao_pagamento: string | null;
      entrega_prevista: string | null;
      centros_custo_itens: string | null;
      tem_foto: number;
      pode_completar_foto: number;
      na_minha_vez: number;
      nivel_ordem: number | null;
      nivel_nome: string | null;
      nivel_total: number | null;
      nivel_direcionado: string | null;
    }>(`
      SELECT
        CONVERT(VARCHAR(36), p.[id]) AS [id],
        p.[fornecedor_nome],
        p.[comprador_nome],
        p.[valor_total],
        p.[moeda],
        CONVERT(VARCHAR(10), p.[data_emissao], 23) AS [data_emissao],
        p.[situacao_erp],
        p.[quantidade_itens],
        p.[condicao_pagamento],
        CONVERT(VARCHAR(10), p.[entrega_prevista], 23) AS [entrega_prevista],
        p.[centros_custo_itens],
        CASE WHEN p.[snapshot_em] IS NULL THEN 0 ELSE 1 END AS [tem_foto],
        CASE
          WHEN (p.[snapshot_em] IS NULL OR (p.[status] = 'pendente' AND p.[centros_custo_itens] IS NULL))
            AND (p.[foto_tentativa_em] IS NULL
              OR p.[foto_tentativa_em] < DATEADD(MINUTE, -${MINUTOS_ENTRE_TENTATIVAS_DE_FOTO}, SYSDATETIME()))
          THEN 1 ELSE 0
        END AS [pode_completar_foto],
        CASE WHEN ${naMinhaVez} THEN 1 ELSE 0 END AS [na_minha_vez],
        ${colunasNivelAtual},
        a.[numero] AS [numero_aprovacao],
        p.[empresa],
        p.[numero_pedido],
        p.[status],
        a.[criado_por_nome] AS [enviado_por],
        CONVERT(VARCHAR(33), p.[criado_em], 126) AS [enviado_em],
        a.[observacao],
        p.[aprovador_nome],
        p.[decidido_por_nome],
        CONVERT(VARCHAR(33), p.[decidido_em], 126) AS [decidido_em],
        p.[comentario_decisao]
      FROM dbo.portal_aprovacoes_pedido_compra AS p
      INNER JOIN dbo.portal_aprovacoes AS a ON a.[id] = p.[aprovacao_id]
      WHERE (
          (@status = 'pendente' AND p.[status] = 'pendente' AND ${naMinhaVez})
          OR (@status <> 'pendente' AND ${visivelParaMim} AND (@status = '' OR p.[status] = @status))
        )
        AND (@id IS NULL OR p.[id] = @id)
        AND (@empresa IS NULL OR p.[empresa] = @empresa)
        AND (@dias IS NULL OR COALESCE(p.[decidido_em], p.[criado_em]) >= DATEADD(DAY, -@dias, CAST(SYSDATETIME() AS DATE)))
        ${filtroCentroCusto}
        AND (
          @busca = ''
          OR CONVERT(VARCHAR(20), p.[numero_pedido]) LIKE @buscaLike
          OR a.[criado_por_nome] LIKE @buscaLike
          OR p.[fornecedor_nome] LIKE @buscaLike
          OR p.[comprador_nome] LIKE @buscaLike
        )
      ORDER BY
        CASE WHEN p.[status] = 'pendente' THEN 0 ELSE 1 END,
        CASE WHEN p.[status] = 'pendente' THEN p.[criado_em] END ASC,
        p.[decidido_em] DESC;
    `);

  return result.recordset.map((linha) => ({
    id: linha.id,
    numeroAprovacao: linha.numero_aprovacao,
    empresa: linha.empresa,
    empresaNome: nomeEmpresaPedidoCompra(linha.empresa),
    numero: Number(linha.numero_pedido),
    status: linha.status,
    enviadoPor: linha.enviado_por,
    enviadoEm: linha.enviado_em,
    observacao: linha.observacao,
    aprovadorNome: linha.aprovador_nome,
    decididoPor: linha.decidido_por_nome,
    decididoEm: linha.decidido_em,
    comentario: linha.comentario_decisao,
    fornecedorNome: linha.fornecedor_nome,
    compradorNome: linha.comprador_nome,
    valorTotal: linha.valor_total === null ? null : Number(linha.valor_total),
    moeda: linha.moeda,
    dataEmissao: linha.data_emissao,
    situacaoErp: linha.situacao_erp,
    quantidadeItens: linha.quantidade_itens,
    condicaoPagamento: linha.condicao_pagamento,
    entregaPrevista: linha.entrega_prevista,
    temFoto: linha.tem_foto === 1,
    centrosCusto:
      linha.centros_custo_itens === null
        ? null
        : [...new Set(linha.centros_custo_itens.split(",").filter(Boolean))],
    podeCompletarFoto: linha.pode_completar_foto === 1,
    naMinhaVez: linha.na_minha_vez === 1,
    nivelAtual: nivelAtualDe(linha),
  }));
}

/* Quantos pedidos sem foto a lista completa por carga -- limita o tempo de resposta. */
const MAXIMO_FOTOS_POR_CARGA = 30;

/* Depois de uma tentativa sem sucesso, quanto esperar para consultar o ERP de novo. */
export const MINUTOS_ENTRE_TENTATIVAS_DE_FOTO = 60;

/*
 * Completa a foto dos pedidos da lista que ainda não têm (enviados antes
 * da foto existir, ou com o ERP fora do ar no envio): consulta o ERP uma
 * vez, grava, e da próxima vez já vem do banco. Pedido pendente que tem
 * foto mas é de antes dos centros de custo ganha SÓ os centros de custo
 * -- o resto da foto é do envio e não muda. Pedido não encontrado ou
 * ERP fora do ar: fica como está, sem travar a lista. Devolve quantos
 * foram completados (a rota relê a lista se for > 0).
 */
export async function completarFotosFaltantes(
  pedidos: Pick<PedidoCompraPainel, "id" | "empresa" | "numero" | "podeCompletarFoto" | "temFoto">[]
): Promise<number> {
  const faltando = pedidos.filter((pedido) => pedido.podeCompletarFoto).slice(0, MAXIMO_FOTOS_POR_CARGA);
  if (faltando.length === 0) return 0;

  const pool = await getSqlServerPool();
  const completadosIds = new Set<string>();
  let completados = 0;

  for (let inicio = 0; inicio < faltando.length; inicio += CONSULTAS_ERP_SIMULTANEAS) {
    const bloco = faltando.slice(inicio, inicio + CONSULTAS_ERP_SIMULTANEAS);
    let erpFora = false;

    await Promise.all(
      bloco.map(async (pedido) => {
        try {
          const erp = await consultarPedidoCompraErp(pedido.empresa, pedido.numero, { timeoutMs: 8000 });
          if (!erp) return;

          if (pedido.temFoto) {
            await pool
              .request()
              .input("id", sql.UniqueIdentifier, pedido.id)
              .input("centros", sql.NVarChar(sql.MAX), centrosCustoDosItens(erp))
              .query(`
                UPDATE dbo.portal_aprovacoes_pedido_compra SET [centros_custo_itens] = @centros
                WHERE [id] = @id AND [centros_custo_itens] IS NULL;
              `);
            completadosIds.add(pedido.id);
            completados += 1;
            return;
          }

          await parametrosDaFoto(pool.request(), erp)
            .input("id", sql.UniqueIdentifier, pedido.id)
            .query(`
              UPDATE dbo.portal_aprovacoes_pedido_compra
              SET [fornecedor_codigo] = @fornecedorCodigo,
                  [fornecedor_nome] = @fornecedorNome,
                  [comprador_nome] = @compradorNome,
                  [data_emissao] = @dataEmissao,
                  [valor_total] = @valorTotal,
                  [moeda] = @moeda,
                  [situacao_erp] = @situacaoErp,
                  [quantidade_itens] = @quantidadeItens,
                  [condicao_pagamento] = @condicaoPagamento,
                  [entrega_prevista] = @entregaPrevista,
                  [centros_custo_itens] = @centrosCustoItens,
                  [snapshot_em] = SYSDATETIME()
              WHERE [id] = @id AND [snapshot_em] IS NULL;
            `);
          completadosIds.add(pedido.id);
          completados += 1;
        } catch (error) {
          if (!(error instanceof ErroConsultaErp)) throw error;
          erpFora = true;
        }
      })
    );

    if (erpFora) break;
  }

  /*
   * O que não completou (não existe no ERP, ou o ERP falhou -- inclusive
   * os blocos que nem chegaram a ser consultados) fica marcado: a próxima
   * tentativa só depois do intervalo, para a lista não esperar o ERP a
   * cada abertura.
   */
  const pendentesDeFoto = faltando.filter((pedido) => !completadosIds.has(pedido.id));

  if (pendentesDeFoto.length > 0) {
    const request = pool.request();
    pendentesDeFoto.forEach((pedido, i) => request.input(`t${i}`, sql.UniqueIdentifier, pedido.id));

    await request.query(`
      UPDATE dbo.portal_aprovacoes_pedido_compra
      SET [foto_tentativa_em] = SYSDATETIME()
      WHERE [id] IN (${pendentesDeFoto.map((_, i) => `@t${i}`).join(", ")})
        AND ([snapshot_em] IS NULL OR [centros_custo_itens] IS NULL);
    `);
  }

  return completados;
}

/* Badge da aba no painel: pendentes que este diretor pode decidir. */
export async function contarPedidosPendentes(usuarioId: string): Promise<number> {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("usuarioId", sql.UniqueIdentifier, usuarioId)
    .query<{ total: number }>(`
      SELECT COUNT(*) AS [total]
      FROM dbo.portal_aprovacoes_pedido_compra AS p
      WHERE p.[status] = 'pendente' AND ${naMinhaVez};
    `);

  return result.recordset[0]?.total ?? 0;
}

export interface DecisaoPedido {
  id: string;
  empresa: number;
  numero: number;
  numeroAprovacao: number;
  /* avancou: subiu de nível | aprovado: era o último | devolvido: voltou ao comprador. */
  resultado: "avancou" | "aprovado" | "devolvido";
  nivelNome: string;
  proximoNivel: string | null;
  /* Quem vai decidir o próximo nível, quando direcionado. */
  direcionadoPara: string | null;
}

/*
 * Para quem direcionar o próximo nível ao aprovar: "todos" do nível, a
 * "sugestao" das regras da alçada (calculada pedido a pedido), ou o id
 * de uma pessoa do próximo nível.
 */
export type DirecionarPedidos = "todos" | "sugestao" | { usuarioId: string };

/*
 * Aprova ou devolve, no nível do usuário, os pedidos marcados -- cada um
 * na sua transação: a etapa e o status do pedido mudam juntos. Pedido
 * que não está na vez do usuário (outra pessoa do nível decidiu antes,
 * ou ainda não chegou ao nível dele) entra em `falhas` com o motivo.
 *
 * O pedido só fica "aprovado" quando o último nível aprova; "devolvido"
 * em qualquer nível encerra a cadeia e o comprador pode reenviar.
 */
export async function decidirPedidosCompra(params: {
  ids: string[];
  usuario: { id: string; nomeExibicao: string };
  acao: AcaoEtapa;
  comentario: string | null;
  direcionarPara?: DirecionarPedidos;
}): Promise<{ decididos: DecisaoPedido[]; falhas: { id: string; motivo: string }[] }> {
  const pool = await getSqlServerPool();
  const decididos: DecisaoPedido[] = [];
  const falhas: { id: string; motivo: string }[] = [];

  /*
   * Direcionando: o próximo nível de cada pedido é olhado antes, fora das
   * transações (a sugestão pode consultar o ERP). Pedido no último nível
   * não tem o que direcionar e só é aprovado; a pessoa escolhida que não
   * for do próximo nível de um pedido faz ESSE pedido falhar, com o motivo.
   */
  const modo = params.acao === "aprovar" ? (params.direcionarPara ?? "todos") : "todos";
  const proximos =
    modo === "todos"
      ? new Map<string, DirecionamentoDaVez>()
      : new Map((await buscarDirecionamentosPedidos(params.ids, params.usuario.id)).map((d) => [d.itemId, d]));

  const direcionarPara = (id: string): string | null => {
    const proximo = proximos.get(id.toUpperCase());
    if (modo === "todos" || !proximo) return null;
    return modo === "sugestao" ? (proximo.sugestao?.id ?? null) : modo.usuarioId;
  };

  for (const id of params.ids) {
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const item = await new sql.Request(transaction)
        .input("id", sql.UniqueIdentifier, id)
        .query<{ empresa: number; numero_pedido: number | string; status: string; numero_aprovacao: number }>(`
          SELECT p.[empresa], p.[numero_pedido], p.[status], a.[numero] AS [numero_aprovacao]
          FROM dbo.portal_aprovacoes_pedido_compra AS p WITH (UPDLOCK, HOLDLOCK)
          INNER JOIN dbo.portal_aprovacoes AS a ON a.[id] = p.[aprovacao_id]
          WHERE p.[id] = @id;
        `);

      const linha = item.recordset[0];
      if (!linha) throw new ValidationError("Pedido não encontrado.");
      if (linha.status !== "pendente") throw new ValidationError("Este pedido já foi decidido.");

      const etapa = await decidirEtapa(transaction, {
        tipo: TIPO_PEDIDO_COMPRA,
        itemId: id,
        usuario: { id: params.usuario.id, nome: params.usuario.nomeExibicao },
        acao: params.acao,
        comentario: params.comentario,
        direcionarPara: direcionarPara(id),
      });

      /* O pedido em si só muda quando a cadeia termina (aprovado) ou volta (devolvido). */
      await new sql.Request(transaction)
        .input("id", sql.UniqueIdentifier, id)
        .input("terminou", sql.Bit, etapa.resultado !== "avancou")
        .input("status", sql.VarChar(20), etapa.resultado === "devolvido" ? "devolvido" : "aprovado")
        .input("usuarioId", sql.UniqueIdentifier, params.usuario.id)
        .input("nome", sql.NVarChar(200), params.usuario.nomeExibicao)
        .input("comentario", sql.NVarChar(2000), params.comentario)
        .query(`
          UPDATE dbo.portal_aprovacoes_pedido_compra
          SET [status] = CASE WHEN @terminou = 1 THEN @status ELSE [status] END,
              [decidido_por_usuario_id] = CASE WHEN @terminou = 1 THEN @usuarioId ELSE [decidido_por_usuario_id] END,
              [decidido_por_nome] = CASE WHEN @terminou = 1 THEN @nome ELSE [decidido_por_nome] END,
              [decidido_em] = CASE WHEN @terminou = 1 THEN SYSDATETIME() ELSE [decidido_em] END,
              [comentario_decisao] = CASE WHEN @terminou = 1 THEN @comentario ELSE [comentario_decisao] END,
              [atualizado_em] = SYSDATETIME()
          WHERE [id] = @id;
        `);

      await transaction.commit();

      decididos.push({
        id,
        empresa: linha.empresa,
        numero: Number(linha.numero_pedido),
        numeroAprovacao: linha.numero_aprovacao,
        resultado: etapa.resultado,
        nivelNome: etapa.nivelNome,
        proximoNivel: etapa.proximoNivel,
        direcionadoPara: etapa.direcionadoPara,
      });
    } catch (error) {
      await transaction.rollback().catch(() => {});
      if (!(error instanceof ValidationError)) throw error;
      falhas.push({ id, motivo: error.message });
    }
  }

  return { decididos, falhas };
}

/* Quantos pedidos por consulta de direcionamento (cada um pode precisar do ERP). */
export const MAXIMO_PEDIDOS_DIRECIONAMENTO = 200;

/*
 * Para quem o próximo nível pode ser direcionado, e a sugestão das
 * regras da alçada, para os pedidos na vez do usuário. A regra olha a
 * empresa e o centro de custo dos itens; pedido cuja foto é de antes
 * de guardarmos os centros de custo busca no ERP uma vez e grava.
 * ERP fora do ar: segue sem os centros de custo (a sugestão cai na
 * regra só da empresa).
 */
export async function buscarDirecionamentosPedidos(
  ids: string[],
  usuarioId: string,
  opcoes: { completarNoErp?: boolean } = {}
): Promise<DirecionamentoDaVez[]> {
  const unicos = [...new Set(ids.map((id) => id.toUpperCase()))].slice(0, MAXIMO_PEDIDOS_DIRECIONAMENTO);
  if (unicos.length === 0) return [];

  const pool = await getSqlServerPool();
  const request = pool.request();
  unicos.forEach((id, i) => request.input(`p${i}`, sql.UniqueIdentifier, id));

  const pedidos = await request.query<{
    id: string;
    empresa: number;
    numero_pedido: number | string;
    centros_custo_itens: string | null;
  }>(`
    SELECT CONVERT(VARCHAR(36), [id]) AS [id], [empresa], [numero_pedido], [centros_custo_itens]
    FROM dbo.portal_aprovacoes_pedido_compra
    WHERE [status] = 'pendente' AND [id] IN (${unicos.map((_, i) => `@p${i}`).join(", ")});
  `);

  const centrosPorPedido = new Map(pedidos.recordset.map((p) => [p.id, p.centros_custo_itens]));
  /* Na lista (centenas de pedidos) não consulta o ERP: a lista completa os centros de custo aos poucos. */
  const semCentros = opcoes.completarNoErp === false ? [] : pedidos.recordset.filter((p) => p.centros_custo_itens === null);

  for (let inicio = 0; inicio < semCentros.length; inicio += CONSULTAS_ERP_SIMULTANEAS) {
    let erpFora = false;

    await Promise.all(
      semCentros.slice(inicio, inicio + CONSULTAS_ERP_SIMULTANEAS).map(async (pedido) => {
        try {
          const erp = await consultarPedidoCompraErp(pedido.empresa, Number(pedido.numero_pedido), { timeoutMs: 8000 });
          if (!erp) return;

          const centros = centrosCustoDosItens(erp);
          centrosPorPedido.set(pedido.id, centros);
          await pool
            .request()
            .input("id", sql.UniqueIdentifier, pedido.id)
            .input("centros", sql.NVarChar(sql.MAX), centros)
            .query(`
              UPDATE dbo.portal_aprovacoes_pedido_compra SET [centros_custo_itens] = @centros
              WHERE [id] = @id AND [centros_custo_itens] IS NULL;
            `);
        } catch (error) {
          if (!(error instanceof ErroConsultaErp)) throw error;
          erpFora = true;
        }
      })
    );

    if (erpFora) break;
  }

  return buscarDirecionamentosDaVez({
    usuarioId,
    contextos: new Map(
      pedidos.recordset.map((pedido) => {
        /* "" = pedido sem itens; "a,,b" = o 2º item sem centro de custo (conta como fora). */
        const centros = centrosPorPedido.get(pedido.id);
        return [pedido.id, { empresa: pedido.empresa, centrosCustoItens: centros ? centros.split(",") : [] }];
      })
    ),
  });
}

/*
 * Pedidos pendentes que entraram antes das alçadas (sem cadeia): entram
 * no nível 1 da alçada da empresa assim que ela existir. Sem alçada
 * ainda, ficam como estão -- a próxima carga tenta de novo.
 */
export async function iniciarFluxosSemEtapa(): Promise<number> {
  const pool = await getSqlServerPool();

  const semCadeia = await pool.request().query<{
    id: string;
    empresa: number;
    enviado_por: string;
    observacao: string | null;
    enviado_em: string;
  }>(`
    SELECT TOP 50 CONVERT(VARCHAR(36), p.[id]) AS [id], p.[empresa], a.[criado_por_nome] AS [enviado_por], a.[observacao],
           CONVERT(VARCHAR(33), p.[criado_em], 126) AS [enviado_em]
    FROM dbo.portal_aprovacoes_pedido_compra AS p
    INNER JOIN dbo.portal_aprovacoes AS a ON a.[id] = p.[aprovacao_id]
    WHERE p.[status] = 'pendente'
      AND NOT EXISTS (SELECT 1 FROM dbo.portal_aprovacoes_etapas AS e WHERE e.[item_id] = p.[id])
    ORDER BY p.[criado_em];
  `);

  let iniciados = 0;

  for (const pedido of semCadeia.recordset) {
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      await iniciarFluxo(transaction, {
        tipo: TIPO_PEDIDO_COMPRA,
        itemId: pedido.id,
        contexto: { empresa: pedido.empresa, setor: null },
        usuario: { id: null, nome: pedido.enviado_por },
        comentario: pedido.observacao,
        nomeEmpresa: nomeEmpresaPedidoCompra,
        enviadoEm: pedido.enviado_em,
      });
      await transaction.commit();
      iniciados += 1;
    } catch (error) {
      await transaction.rollback().catch(() => {});
      if (!(error instanceof ValidationError)) throw error;
    }
  }

  return iniciados;
}

export interface RodadaPedido {
  numeroAprovacao: number;
  enviadoEm: string;
  status: string;
}

/*
 * Cadeia e histórico do pedido no detalhe: a cadeia do envio atual e o
 * histórico de TODAS as rodadas (cada reenvio depois de devolução é um
 * item novo, com a sua aprovação).
 */
export async function buscarFluxoDoPedido(
  id: string,
  chave: ChavePedido
): Promise<{ etapas: EtapaDoItem[]; historico: (EventoHistorico & { numeroAprovacao: number })[]; rodadas: RodadaPedido[] }> {
  const pool = await getSqlServerPool();

  const [fluxo, historico, rodadas] = await Promise.all([
    buscarFluxoDoItem(id),
    pool
      .request()
      .input("empresa", sql.Int, chave.empresa)
      .input("numero", sql.BigInt, chave.numero)
      .query<{
        acao: EventoHistorico["acao"];
        ciclo: number | null;
        nivel_nome: string | null;
        usuario_nome: string | null;
        comentario: string | null;
        criado_em: string;
        numero_aprovacao: number;
      }>(`
        SELECT h.[acao], h.[ciclo], h.[nivel_nome], h.[usuario_nome], h.[comentario],
               CONVERT(VARCHAR(33), h.[criado_em], 126) AS [criado_em], a.[numero] AS [numero_aprovacao]
        FROM dbo.portal_aprovacoes_historico AS h
        INNER JOIN dbo.portal_aprovacoes_pedido_compra AS p ON p.[id] = h.[item_id]
        INNER JOIN dbo.portal_aprovacoes AS a ON a.[id] = p.[aprovacao_id]
        WHERE p.[empresa] = @empresa AND p.[numero_pedido] = @numero
        ORDER BY h.[criado_em], h.[id];
      `),
    pool
      .request()
      .input("empresa", sql.Int, chave.empresa)
      .input("numero", sql.BigInt, chave.numero)
      .query<{ numero_aprovacao: number; enviado_em: string; status: string }>(`
        SELECT a.[numero] AS [numero_aprovacao], CONVERT(VARCHAR(33), p.[criado_em], 126) AS [enviado_em], p.[status]
        FROM dbo.portal_aprovacoes_pedido_compra AS p
        INNER JOIN dbo.portal_aprovacoes AS a ON a.[id] = p.[aprovacao_id]
        WHERE p.[empresa] = @empresa AND p.[numero_pedido] = @numero
        ORDER BY p.[criado_em];
      `),
  ]);

  return {
    etapas: fluxo.etapas,
    historico: historico.recordset.map((linha) => ({
      acao: linha.acao,
      ciclo: linha.ciclo,
      nivelNome: linha.nivel_nome,
      usuarioNome: linha.usuario_nome,
      comentario: linha.comentario,
      criadoEm: linha.criado_em,
      numeroAprovacao: linha.numero_aprovacao,
    })),
    rodadas: rodadas.recordset.map((linha) => ({
      numeroAprovacao: linha.numero_aprovacao,
      enviadoEm: linha.enviado_em,
      status: linha.status,
    })),
  };
}

/* Um pedido que o usuário enxerga (a cadeia chegou ao nível dele) -- null se não. */
export async function buscarPedidoDoDiretor(
  id: string,
  usuarioId: string
): Promise<{ empresa: number; numero: number } | null> {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .input("usuarioId", sql.UniqueIdentifier, usuarioId)
    .query<{ empresa: number; numero_pedido: number | string }>(`
      SELECT p.[empresa], p.[numero_pedido]
      FROM dbo.portal_aprovacoes_pedido_compra AS p
      WHERE p.[id] = @id AND ${visivelParaMim};
    `);

  const linha = result.recordset[0];
  return linha ? { empresa: linha.empresa, numero: Number(linha.numero_pedido) } : null;
}

export interface AprovacaoDoPedido {
  nivelOrdem: number;
  nivelNome: string;
  usuarioId: string | null;
  nome: string;
  decididoEm: string;
}

/*
 * Os níveis que já aprovaram o envio atual do pedido (para o carimbo do
 * PDF) e o número da aprovação. Devolução não entra: num pedido
 * devolvido, as aprovações daquela rodada não valem mais.
 */
export async function buscarAprovacoesDoPedido(
  id: string
): Promise<{ numeroAprovacao: number; status: string; totalNiveis: number; aprovacoes: AprovacaoDoPedido[] }> {
  const pool = await getSqlServerPool();
  const result = await pool
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .query<{
      numero_aprovacao: number;
      status: string;
      ordem: number | null;
      nivel_nome: string | null;
      usuario_id: string | null;
      nome: string | null;
      decidido_em: string | null;
      total_niveis: number;
    }>(`
      SELECT a.[numero] AS [numero_aprovacao], p.[status], e.[ordem], e.[nivel_nome],
             (SELECT COUNT(*) FROM dbo.portal_aprovacoes_etapas AS et
              WHERE et.[item_id] = p.[id]
                AND et.[ciclo] = (SELECT MAX(ec.[ciclo]) FROM dbo.portal_aprovacoes_etapas AS ec WHERE ec.[item_id] = p.[id])) AS [total_niveis],
             CONVERT(VARCHAR(36), e.[decidido_por_usuario_id]) AS [usuario_id], e.[decidido_por_nome] AS [nome],
             CONVERT(VARCHAR(33), e.[decidido_em], 126) AS [decidido_em]
      FROM dbo.portal_aprovacoes_pedido_compra AS p
      INNER JOIN dbo.portal_aprovacoes AS a ON a.[id] = p.[aprovacao_id]
      LEFT JOIN dbo.portal_aprovacoes_etapas AS e
        ON e.[item_id] = p.[id] AND e.[status] = 'aprovado'
        AND e.[ciclo] = (SELECT MAX(ec.[ciclo]) FROM dbo.portal_aprovacoes_etapas AS ec WHERE ec.[item_id] = p.[id])
      WHERE p.[id] = @id
      ORDER BY e.[ordem];
    `);

  const linhas = result.recordset;
  const devolvido = linhas[0]?.status === "devolvido";

  return {
    numeroAprovacao: linhas[0]?.numero_aprovacao ?? 0,
    status: linhas[0]?.status ?? "",
    totalNiveis: linhas[0]?.total_niveis ?? 0,
    aprovacoes: devolvido
      ? []
      : linhas
          .filter((linha) => linha.ordem !== null && linha.nome && linha.decidido_em)
          .map((linha) => ({
            nivelOrdem: linha.ordem!,
            nivelNome: linha.nivel_nome ?? "",
            usuarioId: linha.usuario_id,
            nome: linha.nome!,
            decididoEm: linha.decidido_em!,
          })),
  };
}
