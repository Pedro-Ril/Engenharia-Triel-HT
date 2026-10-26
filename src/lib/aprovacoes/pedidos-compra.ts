import "server-only";

import { NextResponse } from "next/server";

import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalText } from "@/lib/auth/validation";
import { getSqlServerPool, sql } from "@/lib/database/sql-server";

import type { PedidoCompraErp } from "@/modules/aprovacoes/types/aprovacoes.types";
import { registrarLog } from "@/lib/monitoramento/logs";

import { nomeEmpresaPedidoCompra } from "./empresas-pedido-compra";
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

/* Na lista para o legado: o diretor e as empresas que ele aprova. */
export interface AprovadorComEmpresas extends AprovadorPedidoCompra {
  empresas: { codigo: number; nome: string }[];
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

const colunasAprovador = `
  CONVERT(VARCHAR(36), u.[id]) AS [id],
  LOWER(u.[sam_account_name]) AS [login],
  u.[nome_exibicao] AS [nome],
  u.[email],
  e.[empresa]
`;

/*
 * Aprovador de pedido de compra = marcado como aprovador do tipo
 * (portal_aprovacoes_atendentes), ativo, e com a empresa no escopo
 * (portal_aprovacoes_pedido_compra_empresas). Sem empresa marcada, não
 * recebe pedido nenhum -- nega por padrão.
 */
const juncoesAprovador = `
  FROM dbo.portal_aprovacoes_atendentes AS a
  INNER JOIN dbo.portal_usuarios AS u ON u.[id] = a.[usuario_id]
  INNER JOIN dbo.portal_aprovacoes_pedido_compra_empresas AS e ON e.[usuario_id] = u.[id]
  WHERE a.[tipo] = @tipo AND u.[ativo] = 1
`;

type LinhaAprovador = AprovadorPedidoCompra & { id: string; empresa: number };
type AprovadorResolvido = AprovadorPedidoCompra & { id: string; empresas: Set<number> };

function agruparAprovadores(linhas: LinhaAprovador[]): Map<string, AprovadorResolvido> {
  const porLogin = new Map<string, AprovadorResolvido>();

  linhas.forEach((linha) => {
    const atual = porLogin.get(linha.login);
    if (atual) {
      atual.empresas.add(linha.empresa);
    } else {
      porLogin.set(linha.login, {
        id: linha.id,
        login: linha.login,
        nome: linha.nome,
        email: linha.email,
        empresas: new Set([linha.empresa]),
      });
    }
  });

  return porLogin;
}

/*
 * Diretores que podem receber pedido de compra -- a lista que o legado
 * mostra para o comprador escolher. Com `empresa`, só quem aprova
 * aquela empresa.
 */
export async function listarAprovadoresPedidoCompra(empresa: number | null): Promise<AprovadorComEmpresas[]> {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("tipo", sql.VarChar(40), TIPO_PEDIDO_COMPRA)
    .query<LinhaAprovador>(`
      SELECT ${colunasAprovador}
      ${juncoesAprovador}
      ORDER BY u.[nome_exibicao], e.[empresa];
    `);

  return [...agruparAprovadores(result.recordset).values()]
    .filter((aprovador) => empresa === null || aprovador.empresas.has(empresa))
    .map(({ login, nome, email, empresas }) => ({
      login,
      nome,
      email,
      empresas: [...empresas].map((codigo) => ({ codigo, nome: nomeEmpresaPedidoCompra(codigo) })),
    }));
}

/*
 * Login -> usuário, recusando quem não é aprovador de pedidos de compra
 * ou não aprova a empresa do pedido que recebeu.
 */
async function resolverAprovadores(pedidos: PedidoEnviado[]): Promise<Map<string, AprovadorResolvido>> {
  const logins = [...new Set(pedidos.map((p) => p.aprovador).filter((l): l is string => !!l))];
  if (logins.length === 0) return new Map();

  const pool = await getSqlServerPool();
  const request = pool.request().input("tipo", sql.VarChar(40), TIPO_PEDIDO_COMPRA);
  logins.forEach((login, i) => request.input(`l${i}`, sql.NVarChar(100), login));

  const result = await request.query<LinhaAprovador>(`
    SELECT ${colunasAprovador}
    ${juncoesAprovador}
      AND LOWER(u.[sam_account_name]) IN (${logins.map((_, i) => `@l${i}`).join(", ")});
  `);

  const porLogin = agruparAprovadores(result.recordset);

  const invalidos = logins.filter((login) => !porLogin.has(login));
  if (invalidos.length > 0) {
    throw new ValidationError(`Não é aprovador de pedidos de compra no portal: ${invalidos.join(", ")}.`);
  }

  const foraDoEscopo = pedidos.filter(
    (pedido) => pedido.aprovador && !porLogin.get(pedido.aprovador)?.empresas.has(pedido.empresa)
  );
  if (foraDoEscopo.length > 0) {
    const exemplos = foraDoEscopo
      .slice(0, 5)
      .map((p) => `${p.numero} (${nomeEmpresaPedidoCompra(p.empresa)}) → ${porLogin.get(p.aprovador!)?.nome}`);
    throw new ValidationError(
      `O diretor escolhido não aprova pedidos desta empresa: ${exemplos.join("; ")}${foraDoEscopo.length > 5 ? "…" : ""}.`
    );
  }

  return porLogin;
}

function semId(aprovador: AprovadorResolvido | undefined): AprovadorPedidoCompra | null {
  return aprovador ? { login: aprovador.login, nome: aprovador.nome, email: aprovador.email } : null;
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
    .input("entregaPrevista", sql.Date, erp ? primeiraEntrega(erp) : null);
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
  aprovadores: Map<string, AprovadorResolvido>,
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
        .query<{ numero_aprovacao: number; login: string | null; nome: string | null; email: string | null }>(`
          SELECT TOP 1
            a.[numero] AS [numero_aprovacao],
            LOWER(u.[sam_account_name]) AS [login],
            p.[aprovador_nome] AS [nome],
            u.[email]
          FROM dbo.portal_aprovacoes_pedido_compra AS p WITH (UPDLOCK, HOLDLOCK)
          INNER JOIN dbo.portal_aprovacoes AS a ON a.[id] = p.[aprovacao_id]
          LEFT JOIN dbo.portal_usuarios AS u ON u.[id] = p.[aprovador_usuario_id]
          WHERE p.[empresa] = @empresa AND p.[numero_pedido] = @numero AND p.[status] = 'pendente';
        `);

      const existente = pendente.recordset[0];

      /* Já pendente: continua com o diretor do primeiro envio (é o que vale no painel). */
      if (existente) {
        resultados.push({
          empresa: pedido.empresa,
          numero: pedido.numero,
          situacao: "ja_pendente",
          aprovador:
            existente.login && existente.nome
              ? { login: existente.login, nome: existente.nome, email: existente.email }
              : null,
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
        const aprovador = pedido.aprovador ? aprovadores.get(pedido.aprovador) : undefined;
        const foto = fotos.get(chaveDoPedido(pedido)) ?? null;

        await parametrosDaFoto(new sql.Request(transaction), foto)
          .input("aprovacaoId", sql.UniqueIdentifier, aprovacaoId)
          .input("empresa", sql.Int, pedido.empresa)
          .input("numero", sql.BigInt, pedido.numero)
          .input("aprovadorId", sql.UniqueIdentifier, aprovador?.id ?? null)
          .input("aprovadorNome", sql.NVarChar(200), aprovador?.nome ?? null)
          .query(`
            INSERT INTO dbo.portal_aprovacoes_pedido_compra
              ([aprovacao_id], [empresa], [numero_pedido], [aprovador_usuario_id], [aprovador_nome],
               [fornecedor_codigo], [fornecedor_nome], [comprador_nome], [data_emissao], [valor_total],
               [moeda], [situacao_erp], [quantidade_itens], [condicao_pagamento], [entrega_prevista],
               [snapshot_em])
            VALUES (@aprovacaoId, @empresa, @numero, @aprovadorId, @aprovadorNome,
               @fornecedorCodigo, @fornecedorNome, @compradorNome, @dataEmissao, @valorTotal,
               @moeda, @situacaoErp, @quantidadeItens, @condicaoPagamento, @entregaPrevista,
               CASE WHEN @fornecedorNome IS NULL THEN NULL ELSE SYSDATETIME() END);
          `);

        resultados.push({
          empresa: pedido.empresa,
          numero: pedido.numero,
          situacao: "criado",
          aprovador: semId(aprovador),
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
 * Grava os pedidos como pendentes. Pedido que já está pendente não
 * duplica: volta como "ja_pendente" com a aprovação em que está. Um
 * pedido já decidido que chega de novo abre uma pendência nova (o
 * histórico da anterior fica).
 */
export async function registrarPedidosParaAprovacao(params: {
  enviadoPor: string | null;
  observacao: string | null;
  pedidos: PedidoEnviado[];
}): Promise<ResultadoEnvio> {
  const aprovadores = await resolverAprovadores(params.pedidos);
  const fotos = await conferirNoErp(params.pedidos);

  try {
    return await tentarRegistrar(params, aprovadores, fotos);
  } catch (error) {
    /* Dois envios do mesmo pedido ao mesmo tempo: o índice único segura um,
       e a segunda tentativa já o encontra pendente. */
    if (ehViolacaoUnica(error)) return tentarRegistrar(params, aprovadores, fotos);
    throw error;
  }
}

export type SituacaoPedido = "nao_enviado" | "pendente" | "aprovado" | "reprovado";

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
  p.[comentario_decisao]
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
 * Pedidos decididos (aprovados/reprovados) depois de `desde` -- o
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
        AND p.[status] IN ('aprovado', 'reprovado')
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

/*
 * O diretor escolhido no envio ainda pode decidir este pedido: ativo,
 * aprovador de pedido de compra e com a empresa do pedido marcada.
 */
const diretorEscolhidoDisponivel = `
  EXISTS (
    SELECT 1
    FROM dbo.portal_usuarios AS ud
    INNER JOIN dbo.portal_aprovacoes_atendentes AS ad
      ON ad.[usuario_id] = ud.[id] AND ad.[tipo] = 'pedido_compra'
    INNER JOIN dbo.portal_aprovacoes_pedido_compra_empresas AS ed
      ON ed.[usuario_id] = ud.[id] AND ed.[empresa] = p.[empresa]
    WHERE ud.[id] = p.[aprovador_usuario_id] AND ud.[ativo] = 1
  )
`;

/*
 * O que o diretor enxerga: pedidos das empresas marcadas para ele em
 * Diretoria → Pedidos de Compra, e que foram direcionados a ele ou a
 * ninguém. Sem empresa marcada, não enxerga nada (nega por padrão).
 *
 * Pedido direcionado a um diretor que não pode mais decidir (perdeu a
 * empresa, deixou de ser aprovador, foi desativado) volta para a fila
 * de todos os aprovadores da empresa -- senão ficaria pendente sem
 * ninguém conseguir ver.
 */
const escopoDoDiretor = `
  EXISTS (
    SELECT 1 FROM dbo.portal_aprovacoes_pedido_compra_empresas AS ee
    WHERE ee.[usuario_id] = @usuarioId AND ee.[empresa] = p.[empresa]
  )
  AND (
    p.[aprovador_usuario_id] IS NULL
    OR p.[aprovador_usuario_id] = @usuarioId
    OR NOT ${diretorEscolhidoDisponivel}
  )
`;

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
  /* Sem foto e sem tentativa recente: a lista pode consultar o ERP para completar. */
  podeCompletarFoto: boolean;
  /* Direcionado a um diretor que não pode mais decidir: liberado para todos da empresa. */
  diretorIndisponivel: boolean;
}

export interface FiltrosPedidosPainel {
  status: Exclude<SituacaoPedido, "nao_enviado"> | "todos";
  empresa: number | null;
  /* Número do pedido, nome de quem enviou ou do fornecedor. */
  busca: string;
  /* Um item só (detalhe do painel). */
  id?: string;
}

export async function listarPedidosPainel(
  usuarioId: string,
  filtros: FiltrosPedidosPainel
): Promise<PedidoCompraPainel[]> {
  const pool = await getSqlServerPool();
  const busca = filtros.busca.trim();

  const result = await pool
    .request()
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
      tem_foto: number;
      pode_completar_foto: number;
      diretor_indisponivel: number;
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
        CASE WHEN p.[snapshot_em] IS NULL THEN 0 ELSE 1 END AS [tem_foto],
        CASE
          WHEN p.[snapshot_em] IS NULL
            AND (p.[foto_tentativa_em] IS NULL
              OR p.[foto_tentativa_em] < DATEADD(MINUTE, -${MINUTOS_ENTRE_TENTATIVAS_DE_FOTO}, SYSDATETIME()))
          THEN 1 ELSE 0
        END AS [pode_completar_foto],
        CASE
          WHEN p.[aprovador_usuario_id] IS NOT NULL AND NOT ${diretorEscolhidoDisponivel} THEN 1
          ELSE 0
        END AS [diretor_indisponivel],
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
      WHERE ${escopoDoDiretor}
        AND (@id IS NULL OR p.[id] = @id)
        AND (@status = '' OR p.[status] = @status)
        AND (@empresa IS NULL OR p.[empresa] = @empresa)
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
    podeCompletarFoto: linha.pode_completar_foto === 1,
    diretorIndisponivel: linha.diretor_indisponivel === 1,
  }));
}

/* Quantos pedidos sem foto a lista completa por carga -- limita o tempo de resposta. */
const MAXIMO_FOTOS_POR_CARGA = 30;

/* Depois de uma tentativa sem sucesso, quanto esperar para consultar o ERP de novo. */
export const MINUTOS_ENTRE_TENTATIVAS_DE_FOTO = 60;

/*
 * Completa a foto dos pedidos da lista que ainda não têm (enviados antes
 * da foto existir, ou com o ERP fora do ar no envio): consulta o ERP uma
 * vez, grava, e da próxima vez já vem do banco. Pedido não encontrado ou
 * ERP fora do ar: fica como está, sem travar a lista. Devolve quantos
 * foram completados (a rota relê a lista se for > 0).
 */
export async function completarFotosFaltantes(
  pedidos: Pick<PedidoCompraPainel, "id" | "empresa" | "numero" | "podeCompletarFoto">[]
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
      WHERE [id] IN (${pendentesDeFoto.map((_, i) => `@t${i}`).join(", ")}) AND [snapshot_em] IS NULL;
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
      WHERE p.[status] = 'pendente' AND ${escopoDoDiretor};
    `);

  return result.recordset[0]?.total ?? 0;
}

/* Empresas marcadas para o diretor: sem nenhuma, a tela explica por que está vazia. */
export async function listarEmpresasDoDiretor(usuarioId: string): Promise<number[]> {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("usuarioId", sql.UniqueIdentifier, usuarioId)
    .query<{ empresa: number }>(`
      SELECT [empresa] FROM dbo.portal_aprovacoes_pedido_compra_empresas
      WHERE [usuario_id] = @usuarioId
      ORDER BY [empresa];
    `);

  return result.recordset.map((linha) => linha.empresa);
}

/*
 * Aprova ou reprova de uma vez os pedidos marcados. Só mexe no que
 * ainda está pendente E no escopo de quem decide -- um id de fora (ou
 * já decidido por outro diretor no meio tempo) é ignorado e volta na
 * contagem de "ignorados". Um UPDATE só: todos saem com o mesmo
 * decidido_em, que a consulta de decisões do legado trata como empate.
 */
export async function decidirPedidosCompra(params: {
  ids: string[];
  usuario: { id: string; nomeExibicao: string };
  decisao: "aprovado" | "reprovado";
  comentario: string | null;
}): Promise<{ decididos: { empresa: number; numero: number; numeroAprovacao: number }[]; ignorados: number }> {
  const pool = await getSqlServerPool();
  const request = pool
    .request()
    .input("usuarioId", sql.UniqueIdentifier, params.usuario.id)
    .input("nome", sql.NVarChar(200), params.usuario.nomeExibicao)
    .input("decisao", sql.VarChar(20), params.decisao)
    .input("comentario", sql.NVarChar(2000), params.comentario);

  params.ids.forEach((id, i) => request.input(`id${i}`, sql.UniqueIdentifier, id));

  const result = await request.query<{ empresa: number; numero_pedido: number | string; numero_aprovacao: number }>(`
    DECLARE @decididos TABLE ([aprovacao_id] UNIQUEIDENTIFIER, [empresa] INT, [numero_pedido] BIGINT);

    UPDATE p
    SET [status] = @decisao,
        [decidido_por_usuario_id] = @usuarioId,
        [decidido_por_nome] = @nome,
        [decidido_em] = SYSDATETIME(),
        [comentario_decisao] = @comentario,
        [atualizado_em] = SYSDATETIME()
    OUTPUT INSERTED.[aprovacao_id], INSERTED.[empresa], INSERTED.[numero_pedido] INTO @decididos
    FROM dbo.portal_aprovacoes_pedido_compra AS p
    WHERE p.[id] IN (${params.ids.map((_, i) => `@id${i}`).join(", ")})
      AND p.[status] = 'pendente'
      AND ${escopoDoDiretor};

    SELECT d.[empresa], d.[numero_pedido], a.[numero] AS [numero_aprovacao]
    FROM @decididos AS d
    INNER JOIN dbo.portal_aprovacoes AS a ON a.[id] = d.[aprovacao_id];
  `);

  const decididos = result.recordset.map((linha) => ({
    empresa: linha.empresa,
    numero: Number(linha.numero_pedido),
    numeroAprovacao: linha.numero_aprovacao,
  }));

  return { decididos, ignorados: params.ids.length - decididos.length };
}

/* Um pedido da fila do diretor -- null se não existe ou está fora do escopo dele. */
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
      WHERE p.[id] = @id AND ${escopoDoDiretor};
    `);

  const linha = result.recordset[0];
  return linha ? { empresa: linha.empresa, numero: Number(linha.numero_pedido) } : null;
}
