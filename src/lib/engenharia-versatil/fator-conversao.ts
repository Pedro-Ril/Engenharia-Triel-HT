import "server-only";

import { ValidationError } from "@/lib/auth/errors";
import { getSqlServerPool, sql } from "@/lib/database/sql-server";

import {
  classificarFatores,
  itensDaPlanilha,
  UNIDADE_DESTINO,
  type ItemErpFator,
  type LinhaFator,
  type SituacaoFator,
} from "./fator-regras";
import { buscarConfigEngenhariaVersatil, lerPlanilha, type ConfigEngenhariaVersatil } from "./separacao";
import { numeroDoProjeto } from "./separacao-regras";

/*
 * Engenharia Versátil -> fator de conversão (unidade de estoque -> KG).
 *
 * analisarFatores só LÊ: o peso de cada item da planilha contra o peso
 * líquido e a conversão para KG já cadastrados no ERP (API Oracle,
 * GET /api/fator-conversao). gravarFatores refaz a análise, simula no
 * ERP (/validar) e só então inclui (POST) / altera (PUT). As rotas do ERP
 * são tudo-ou-nada por chamada. Tudo vai para eng_versatil_fatores.
 *
 * O ambiente (teste | producao) vem da administração; em teste, toda
 * chamada leva ?ambiente=teste.
 */

const LOTE_CONSULTA = 250;
const LOTE_GRAVACAO = 200;

export interface ContextoErp {
  apiUrl: string;
  codEmpresa: number;
  ambiente: "teste" | "producao";
}

function contexto(config: ConfigEngenhariaVersatil): ContextoErp {
  if (!config.erpApiUrl || !config.erpCodEmpresa) {
    throw new ValidationError(
      "A API do ERP e a empresa não estão configuradas. Peça a um administrador para preencher em Administração > Configurações > Engenharia Versátil."
    );
  }
  return { apiUrl: config.erpApiUrl, codEmpresa: config.erpCodEmpresa, ambiente: config.erpAmbiente };
}

function urlErp(ctx: ContextoErp, caminho: string, params: Record<string, string> = {}): string {
  const url = new URL(`${ctx.apiUrl}${caminho}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  if (ctx.ambiente === "teste") url.searchParams.set("ambiente", "teste");
  return url.toString();
}

/* Junta message + erros[].mensagens das respostas de erro do ERP. */
function mensagemDeErro(json: unknown, status: number): string {
  const j = (json ?? {}) as { message?: string; erros?: { cod_item?: string; mensagens?: string[] }[] };
  const detalhes = (j.erros ?? [])
    .slice(0, 10)
    .map((e) => `${e.cod_item ?? "?"}: ${(e.mensagens ?? []).join("; ")}`)
    .join(" | ");
  return [j.message || `O ERP respondeu ${status}.`, detalhes].filter(Boolean).join(" -> ");
}

/* ------------------------------------------------------------------ consulta */

interface ConversaoErp {
  ID: number;
  COD_UNID_MED_ORI: string;
  COD_UNID_MED_DEST: string;
  TAXA: number;
  LEITURA?: string;
}

interface ItemErpCru {
  COD_ITEM: string | number;
  COD_UNID_MED_ESTOQUE: string | null;
  PESO_LIQ: number | null;
  CONVERSOES?: ConversaoErp[];
}

async function consultarErp(ctx: ContextoErp, codigos: string[]): Promise<Map<string, ItemErpFator>> {
  const mapa = new Map<string, ItemErpFator>();
  for (let i = 0; i < codigos.length; i += LOTE_CONSULTA) {
    const lote = codigos.slice(i, i + LOTE_CONSULTA);
    const resposta = await fetch(
      urlErp(ctx, "/api/fator-conversao", {
        cod_emp: String(ctx.codEmpresa),
        cod_item: lote.join(","),
        cod_unid_med_dest: UNIDADE_DESTINO,
      }),
      { cache: "no-store", signal: AbortSignal.timeout(60_000) }
    );
    const json = (await resposta.json().catch(() => null)) as { success?: boolean; data?: ItemErpCru[] } | null;
    /* Lote em que nenhum código existe volta 404: não é erro, só ninguém encontrado. */
    if (resposta.status === 404) continue;
    if (!resposta.ok || !json?.success) throw new Error(`Consulta de fatores no ERP: ${mensagemDeErro(json, resposta.status)}`);

    for (const d of json.data ?? []) {
      const codigo = String(d.COD_ITEM);
      const unid = d.COD_UNID_MED_ESTOQUE ?? null;
      const kg = (d.CONVERSOES ?? []).find((c) => c.COD_UNID_MED_DEST === UNIDADE_DESTINO && c.COD_UNID_MED_ORI === unid);
      mapa.set(codigo, {
        codigo,
        unidEstoque: unid,
        pesoLiq: d.PESO_LIQ ?? null,
        conversaoKg: kg ? { id: Number(kg.ID), taxa: Number(kg.TAXA) } : null,
      });
    }
  }
  return mapa;
}

export interface AnaliseFatores {
  numeroProjeto: string;
  arquivoPlanilha: string;
  codEmpresa: number;
  ambiente: "teste" | "producao";
  linhas: LinhaFator[];
  totais: Record<SituacaoFator, number>;
}

export async function analisarFatores(conteudo: Buffer, nomeArquivo: string): Promise<AnaliseFatores> {
  const numeroProjeto = numeroDoProjeto(nomeArquivo);
  if (!numeroProjeto) {
    throw new ValidationError("O nome da planilha precisa começar com o número do projeto e um hífen (ex.: 1111 - CAÇAMBA.xls).");
  }
  const config = await buscarConfigEngenhariaVersatil();
  const ctx = contexto(config);

  const itens = itensDaPlanilha(lerPlanilha(conteudo), config.abasBlacklist);
  if (itens.length === 0) throw new ValidationError("Nenhum item encontrado nas abas da planilha.");

  const linhas = classificarFatores(itens, await consultarErp(ctx, itens.map((i) => i.codigo)));
  const totais = {
    incluir: 0, alterar: 0, ok: 0, peso_divergente: 0, erp_sem_peso: 0, planilha_sem_peso: 0, estoque_kg: 0,
    sem_unidade: 0, planilha_conflito: 0, nao_encontrado: 0,
  } as Record<SituacaoFator, number>;
  for (const l of linhas) totais[l.situacao]++;

  return { numeroProjeto, arquivoPlanilha: nomeArquivo, codEmpresa: ctx.codEmpresa, ambiente: ctx.ambiente, linhas, totais };
}

/* ------------------------------------------------------------------ gravação */

interface DetalheErp {
  cod_item: string | number;
  acao?: string;
  id?: number;
  taxa?: number;
  leitura?: string;
}

async function chamarFatores(
  ctx: ContextoErp,
  metodo: "POST" | "PUT",
  validar: boolean,
  linhas: LinhaFator[]
): Promise<DetalheErp[]> {
  const resposta = await fetch(urlErp(ctx, validar ? "/api/fator-conversao/validar" : "/api/fator-conversao"), {
    method: metodo,
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({
      cod_emp: ctx.codEmpresa,
      conversoes: linhas.map((l) => ({ cod_item: l.codigo, cod_unid_med_dest: UNIDADE_DESTINO, taxa: l.taxaProposta })),
    }),
  });
  const json = (await resposta.json().catch(() => null)) as { success?: boolean; detalhes?: DetalheErp[] } | null;
  if (!resposta.ok || !json?.success) {
    const operacao = metodo === "POST" ? "inclusão" : "alteração";
    throw new ValidationError(`${validar ? "Simulação da " : ""}${operacao} recusada pelo ERP: ${mensagemDeErro(json, resposta.status)}`);
  }
  return json.detalhes ?? [];
}

export interface ResultadoFatores {
  id: string;
  ambiente: "teste" | "producao";
  incluidos: number;
  alterados: number;
  erro: string | null;
}

export async function gravarFatores(
  conteudo: Buffer,
  nomeArquivo: string,
  marcados: string[],
  usuario: { id: string; nomeExibicao: string }
): Promise<ResultadoFatores> {
  const analise = await analisarFatores(conteudo, nomeArquivo);
  const config = await buscarConfigEngenhariaVersatil();
  const ctx = contexto(config);

  const marcaveis = new Map(analise.linhas.filter((l) => l.marcavel).map((l) => [l.codigo, l]));
  const fora = marcados.filter((c) => !marcaveis.has(c));
  if (fora.length) {
    throw new ValidationError(`Itens que não podem ser gravados agora (o ERP mudou desde a conferência?): ${fora.slice(0, 10).join(", ")}. Confira de novo.`);
  }
  const escolhidos = marcados.map((c) => marcaveis.get(c)!);
  if (escolhidos.length === 0) throw new ValidationError("Marque pelo menos um item para gravar o fator.");

  const incluir = escolhidos.filter((l) => l.operacao === "incluir");
  const alterar = escolhidos.filter((l) => l.operacao === "alterar");
  /* O ERP aceita até 500 por chamada; lotes menores deixam folga. */
  const lotes = (grupo: LinhaFator[]) =>
    Array.from({ length: Math.ceil(grupo.length / LOTE_GRAVACAO) }, (_, i) => grupo.slice(i * LOTE_GRAVACAO, (i + 1) * LOTE_GRAVACAO));
  const chamadas = [
    ...lotes(incluir).map((grupo) => ({ metodo: "POST" as const, grupo })),
    ...lotes(alterar).map((grupo) => ({ metodo: "PUT" as const, grupo })),
  ];

  /* Simula tudo antes de gravar qualquer coisa: se o ERP recusar qualquer lote, nada vai. */
  for (const { metodo, grupo } of chamadas) await chamarFatores(ctx, metodo, true, grupo);

  const pool = await getSqlServerPool();
  const criado = await pool
    .request()
    .input("numero", sql.NVarChar(30), analise.numeroProjeto)
    .input("arquivo", sql.NVarChar(300), nomeArquivo)
    .input("empresa", sql.Int, ctx.codEmpresa)
    .input("ambiente", sql.VarChar(10), ctx.ambiente)
    .input("usuarioId", sql.UniqueIdentifier, usuario.id)
    .input("usuarioNome", sql.NVarChar(200), usuario.nomeExibicao)
    .query<{ id: string }>(`
      INSERT INTO dbo.eng_versatil_fatores ([numero_projeto], [arquivo_planilha], [cod_empresa], [ambiente], [status], [usuario_id], [usuario_nome])
      OUTPUT CONVERT(VARCHAR(36), INSERTED.[id]) AS [id]
      VALUES (@numero, @arquivo, @empresa, @ambiente, 'erro', @usuarioId, @usuarioNome);
    `);
  const id = criado.recordset[0].id;

  const detalhes = new Map<string, DetalheErp>();
  let erro: string | null = null;
  const feitos = new Set<string>();
  for (const { metodo, grupo } of chamadas) {
    if (erro) break;
    try {
      for (const d of await chamarFatores(ctx, metodo, false, grupo)) detalhes.set(String(d.cod_item), d);
      grupo.forEach((l) => feitos.add(l.codigo));
    } catch (e) {
      erro = e instanceof Error ? e.message : String(e);
    }
  }

  /*
   * Falhou no meio (ex.: a conexão caiu depois que o ERP gravou): relê o
   * ERP e conta como feito o que de fato ficou com a taxa nova -- o
   * registro tem de dizer o que está no ERP, não o que a chamada respondeu.
   */
  if (erro) {
    const pendentes = escolhidos.filter((l) => !feitos.has(l.codigo));
    const atual = await consultarErp(ctx, pendentes.map((l) => l.codigo)).catch(() => null);
    for (const l of pendentes) {
      const taxa = atual?.get(l.codigo)?.conversaoKg?.taxa;
      if (taxa !== undefined && l.taxaProposta !== null && Math.abs(taxa - l.taxaProposta) <= l.taxaProposta * 1e-6) {
        feitos.add(l.codigo);
      }
    }
  }

  let ordem = 0;
  for (const l of escolhidos) {
    const d = detalhes.get(l.codigo);
    const acao = !feitos.has(l.codigo)
      ? "erro"
      : d?.acao === "ALTERADO"
        ? "alterado"
        : d?.acao === "MANTIDO"
          ? "mantido"
          : l.operacao === "alterar"
            ? "alterado"
            : "incluido";
    await pool
      .request()
      .input("fatorId", sql.UniqueIdentifier, id)
      .input("ordem", sql.Int, ++ordem)
      .input("aba", sql.NVarChar(100), l.aba)
      .input("codigo", sql.NVarChar(50), l.codigo)
      .input("unid", sql.NVarChar(10), l.unidEstoque)
      .input("pesoPlanilha", sql.Decimal(18, 6), l.pesoPlanilha)
      .input("pesoErp", sql.Decimal(18, 6), l.pesoErp)
      .input("origem", sql.VarChar(10), l.origemPeso ?? "erp")
      .input("taxaAntes", sql.Decimal(21, 10), l.taxaAtual)
      .input("taxaNova", sql.Decimal(21, 10), d?.taxa ?? l.taxaProposta)
      .input("acao", sql.VarChar(20), acao)
      .input("conversaoId", sql.BigInt, d?.id ?? l.conversaoId)
      .input("leitura", sql.NVarChar(200), d?.leitura ?? null)
      .input("mensagem", sql.NVarChar(1000), acao === "erro" ? (erro ?? "Não gravado.").slice(0, 1000) : null)
      .query(`
        INSERT INTO dbo.eng_versatil_fatores_itens
          ([fator_id], [ordem], [aba], [codigo], [unid_estoque], [peso_planilha], [peso_erp], [origem_peso],
           [taxa_antes], [taxa_nova], [acao], [conversao_id], [leitura], [mensagem])
        VALUES (@fatorId, @ordem, @aba, @codigo, @unid, @pesoPlanilha, @pesoErp, @origem,
                @taxaAntes, @taxaNova, @acao, @conversaoId, @leitura, @mensagem);
      `);
  }

  const incluidos = incluir.filter((l) => feitos.has(l.codigo)).length;
  const alterados = alterar.filter((l) => feitos.has(l.codigo)).length;
  await pool
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .input("status", sql.VarChar(20), erro ? "erro" : "concluida")
    .input("incluidos", sql.Int, incluidos)
    .input("alterados", sql.Int, alterados)
    .input("mensagem", sql.NVarChar(2000), erro?.slice(0, 2000) ?? null)
    .query(`
      UPDATE dbo.eng_versatil_fatores
      SET [status] = @status, [incluidos] = @incluidos, [alterados] = @alterados, [mensagem] = @mensagem
      WHERE [id] = @id;
    `);

  return { id, ambiente: ctx.ambiente, incluidos, alterados, erro };
}
