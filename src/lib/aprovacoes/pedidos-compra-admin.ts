import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { ValidationError } from "@/lib/auth/errors";
import { getSqlServerPool, sql } from "@/lib/database/sql-server";
import { fetchMonitorado } from "@/lib/monitoramento/integracao-externa";

/*
 * Administração dos pedidos de compra (Diretoria -> Configurações ->
 * Pedidos de Compra): a integração -- URLs do ERP e a chave que o
 * SupriConnect usa para chamar o portal. Quem aprova é a alçada
 * (Diretoria -> Alçadas, src/lib/aprovacoes/alcadas).
 */

/* ---------------------------------------------------------------
   Integração
   --------------------------------------------------------------- */

export interface ConfigPedidosCompra {
  urlPedido: string | null;
  urlPedidoTeste: string | null;
  usarAmbienteTeste: boolean;
  chaveApiErp: string | null;
  /* Da chave do SupriConnect a tela só vê se existe e como termina. */
  chaveExternaConfigurada: boolean;
  chaveExternaFinal: string | null;
  chaveExternaGeradaEm: string | null;
  chaveExternaGeradaPor: string | null;
  atualizadoEm: string | null;
  atualizadoPor: string | null;
}

export async function buscarConfigPedidosCompra(): Promise<ConfigPedidosCompra> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<{
    url_pedido: string | null;
    url_pedido_teste: string | null;
    usar_ambiente_teste: boolean;
    chave_api_erp: string | null;
    chave_externa_hash: string | null;
    chave_externa_final: string | null;
    chave_externa_gerada_em: string | null;
    chave_externa_gerada_por: string | null;
    atualizado_em: string | null;
    atualizado_por: string | null;
  }>(`
    SELECT
      [url_pedido],
      [url_pedido_teste],
      CAST([usar_ambiente_teste] AS BIT) AS [usar_ambiente_teste],
      [chave_api_erp],
      [chave_externa_hash],
      [chave_externa_final],
      CONVERT(VARCHAR(33), [chave_externa_gerada_em], 126) AS [chave_externa_gerada_em],
      [chave_externa_gerada_por],
      CONVERT(VARCHAR(33), [atualizado_em], 126) AS [atualizado_em],
      [atualizado_por]
    FROM dbo.portal_aprovacoes_pedido_compra_config
    WHERE [id] = 1;
  `);

  const row = result.recordset[0];

  return {
    urlPedido: row?.url_pedido ?? null,
    urlPedidoTeste: row?.url_pedido_teste ?? null,
    usarAmbienteTeste: row?.usar_ambiente_teste ?? false,
    chaveApiErp: row?.chave_api_erp ?? null,
    chaveExternaConfigurada: !!row?.chave_externa_hash,
    chaveExternaFinal: row?.chave_externa_final ?? null,
    chaveExternaGeradaEm: row?.chave_externa_gerada_em ?? null,
    chaveExternaGeradaPor: row?.chave_externa_gerada_por ?? null,
    atualizadoEm: row?.atualizado_em ?? null,
    atualizadoPor: row?.atualizado_por ?? null,
  };
}

function validarUrl(valor: string | null, campo: string): string | null {
  if (!valor) return null;

  try {
    const url = new URL(valor);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
  } catch {
    throw new ValidationError(`${campo}: informe uma URL completa, começando com http:// ou https://.`);
  }

  return valor;
}

export async function salvarConfigPedidosCompra(
  params: {
    urlPedido: string | null;
    urlPedidoTeste: string | null;
    usarAmbienteTeste: boolean;
    chaveApiErp: string | null;
  },
  atualizadoPor: string
): Promise<ConfigPedidosCompra> {
  const pool = await getSqlServerPool();

  await pool
    .request()
    .input("urlPedido", sql.NVarChar(300), validarUrl(params.urlPedido, "URL de produção"))
    .input("urlPedidoTeste", sql.NVarChar(300), validarUrl(params.urlPedidoTeste, "URL de teste"))
    .input("usarAmbienteTeste", sql.Bit, params.usarAmbienteTeste)
    .input("chaveApiErp", sql.NVarChar(200), params.chaveApiErp)
    .input("atualizadoPor", sql.NVarChar(200), atualizadoPor)
    .query(`
      UPDATE dbo.portal_aprovacoes_pedido_compra_config
      SET [url_pedido] = @urlPedido,
          [url_pedido_teste] = @urlPedidoTeste,
          [usar_ambiente_teste] = @usarAmbienteTeste,
          [chave_api_erp] = @chaveApiErp,
          [atualizado_em] = SYSDATETIME(),
          [atualizado_por] = @atualizadoPor
      WHERE [id] = 1;
    `);

  return buscarConfigPedidosCompra();
}

function hashChave(chave: string): string {
  return createHash("sha256").update(chave, "utf8").digest("hex");
}

/*
 * Gera uma chave nova para o SupriConnect e devolve o valor -- única vez
 * em que ele aparece. A anterior para de funcionar na hora.
 */
export async function gerarChaveExterna(geradaPor: string): Promise<{ chave: string; config: ConfigPedidosCompra }> {
  const chave = randomBytes(32).toString("hex");
  const pool = await getSqlServerPool();

  await pool
    .request()
    .input("hash", sql.Char(64), hashChave(chave))
    .input("final", sql.VarChar(8), chave.slice(-4))
    .input("geradaPor", sql.NVarChar(200), geradaPor)
    .query(`
      UPDATE dbo.portal_aprovacoes_pedido_compra_config
      SET [chave_externa_hash] = @hash,
          [chave_externa_final] = @final,
          [chave_externa_gerada_em] = SYSDATETIME(),
          [chave_externa_gerada_por] = @geradaPor
      WHERE [id] = 1;
    `);

  return { chave, config: await buscarConfigPedidosCompra() };
}

/* Desliga a integração de entrada: sem chave, toda chamada externa volta 503. */
export async function revogarChaveExterna(): Promise<ConfigPedidosCompra> {
  const pool = await getSqlServerPool();

  await pool.request().query(`
    UPDATE dbo.portal_aprovacoes_pedido_compra_config
    SET [chave_externa_hash] = NULL,
        [chave_externa_final] = NULL,
        [chave_externa_gerada_em] = NULL,
        [chave_externa_gerada_por] = NULL
    WHERE [id] = 1;
  `);

  return buscarConfigPedidosCompra();
}

/*
 * "nao_configurada" quando nenhuma chave foi gerada ainda; senão, se a
 * recebida confere. Compara os hashes em tempo constante.
 */
export async function conferirChaveExterna(recebida: string): Promise<"nao_configurada" | "valida" | "invalida"> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<{ chave_externa_hash: string | null }>(`
    SELECT [chave_externa_hash] FROM dbo.portal_aprovacoes_pedido_compra_config WHERE [id] = 1;
  `);

  const esperado = result.recordset[0]?.chave_externa_hash;
  if (!esperado) return "nao_configurada";
  if (!recebida) return "invalida";

  const a = Buffer.from(hashChave(recebida), "hex");
  const b = Buffer.from(esperado, "hex");

  return a.length === b.length && timingSafeEqual(a, b) ? "valida" : "invalida";
}

/* {base}/{empresa}/{numero}, mantendo a query da URL configurada (ex.: ?ambiente=teste). */
export function montarUrlPedido(base: string, empresa: number, numeroPedido: number): string {
  const url = new URL(base);
  url.pathname = `${url.pathname.replace(/[/]+$/, "")}/${empresa}/${numeroPedido}`;
  return url.toString();
}

export interface ResultadoTesteErp {
  url: string;
  ambiente: "producao" | "teste";
  status: number | null;
  duracaoMs: number;
  corpo: string;
}

/*
 * Chama a URL configurada com um pedido real para o admin ver o que o
 * ERP responde (resposta crua, como veio).
 */
export async function testarConsultaPedidoErp(params: { empresa: number; numero: number }): Promise<ResultadoTesteErp> {
  const config = await buscarConfigPedidosCompra();
  const base = config.usarAmbienteTeste ? config.urlPedidoTeste : config.urlPedido;
  const ambiente = config.usarAmbienteTeste ? "teste" : "producao";

  if (!base) {
    throw new ValidationError(
      `Informe e salve a URL de ${ambiente === "teste" ? "teste" : "produção"} antes de testar.`
    );
  }

  const url = new URL(montarUrlPedido(base, params.empresa, params.numero));

  const inicio = performance.now();

  try {
    const resposta = await fetchMonitorado(
      url.toString(),
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          ...(config.chaveApiErp ? { Authorization: `Bearer ${config.chaveApiErp}` } : {}),
        },
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      },
      { servico: "erp_pedido_compra", moduloChave: "aprovacoes-painel", origem: "health_check" }
    );

    const texto = await resposta.text();

    return {
      url: url.toString(),
      ambiente,
      status: resposta.status,
      duracaoMs: Math.round(performance.now() - inicio),
      corpo: texto.slice(0, 4000),
    };
  } catch (error) {
    return {
      url: url.toString(),
      ambiente,
      status: null,
      duracaoMs: Math.round(performance.now() - inicio),
      corpo: error instanceof Error ? `Sem resposta do ERP: ${error.message}` : "Sem resposta do ERP.",
    };
  }
}
