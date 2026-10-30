import "server-only";

import { ValidationError } from "@/lib/auth/errors";
import { getSqlServerPool, sql } from "@/lib/database/sql-server";

import {
  classificarFatores,
  FATOR_BRUTO_PADRAO,
  itensDaPlanilha,
  manterProporcaoBruta,
  origemDoPeso,
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
  PESO_BRT?: number | null;
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
        pesoBrt: d.PESO_BRT ?? null,
        conversaoKg: kg ? { id: Number(kg.ID), taxa: Number(kg.TAXA) } : null,
      });
    }
  }
  return mapa;
}

/*
 * Último peso gravado por "Ajustar peso" em cada código, na mesma empresa
 * e ambiente: a decisão do usuário sobre a divergência (ver classificarFator).
 */
async function pesosConfirmados(ctx: ContextoErp, codigos: string[]): Promise<Map<string, number>> {
  const mapa = new Map<string, number>();
  if (codigos.length === 0) return mapa;
  const pool = await getSqlServerPool();
  const result = await pool
    .request()
    .input("empresa", sql.Int, ctx.codEmpresa)
    .input("ambiente", sql.VarChar(10), ctx.ambiente)
    .input("codigos", sql.NVarChar(sql.MAX), JSON.stringify(codigos))
    .query<{ codigo: string; peso_novo: number }>(`
      SELECT x.[codigo], x.[peso_novo]
      FROM (
        SELECT i.[codigo], i.[peso_novo],
               ROW_NUMBER() OVER (PARTITION BY i.[codigo] ORDER BY f.[criado_em] DESC) AS [n]
        FROM dbo.eng_versatil_fatores_itens AS i
        JOIN dbo.eng_versatil_fatores AS f ON f.[id] = i.[fator_id]
        WHERE i.[acao] = 'peso_e_fator' AND i.[peso_novo] IS NOT NULL
          AND f.[cod_empresa] = @empresa AND f.[ambiente] = @ambiente
          AND i.[codigo] IN (SELECT [value] FROM OPENJSON(@codigos))
      ) AS x
      WHERE x.[n] = 1;
    `);
  for (const r of result.recordset) mapa.set(r.codigo, Number(r.peso_novo));
  return mapa;
}

export interface AnaliseFatores {
  numeroProjeto: string;
  arquivoPlanilha: string;
  codEmpresa: number;
  ambiente: "teste" | "producao";
  /* Abas conferidas (vazio = todas fora da blacklist). */
  abas: string[];
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

  const itens = itensDaPlanilha(lerPlanilha(conteudo), config.abasBlacklist, config.abasFator);
  if (itens.length === 0) {
    throw new ValidationError(
      config.abasFator.length
        ? `Nenhum item nas abas do fator de conversão (${config.abasFator.join(", ")}).`
        : "Nenhum item encontrado nas abas da planilha."
    );
  }

  const codigos = itens.map((i) => i.codigo);
  const [erp, confirmados] = await Promise.all([consultarErp(ctx, codigos), pesosConfirmados(ctx, codigos)]);
  const linhas = classificarFatores(itens, erp, confirmados);
  const totais = {
    incluir: 0, alterar: 0, ok: 0, peso_divergente: 0, planilha_sem_peso: 0, estoque_kg: 0,
    sem_unidade: 0, planilha_conflito: 0, nao_encontrado: 0,
  } as Record<SituacaoFator, number>;
  for (const l of linhas) totais[l.situacao]++;

  return {
    numeroProjeto,
    arquivoPlanilha: nomeArquivo,
    codEmpresa: ctx.codEmpresa,
    ambiente: ctx.ambiente,
    abas: config.abasFator,
    linhas,
    totais,
  };
}

/* ------------------------------------------------------------------ gravação */

interface DetalheErp {
  cod_item: string | number;
  acao?: string;
  id?: number;
  taxa?: number;
  leitura?: string;
}

/* Cada chamada ao ERP, como foi: a tela mostra isso no "retorno completo do ERP". */
export interface ChamadaErp {
  etapa: "simulacao" | "gravacao";
  metodo: "POST" | "PUT";
  url: string;
  enviado: unknown;
  status: number | null;
  resposta: unknown;
}

/* Recusa do ERP (ou falha da chamada) com as chamadas feitas até ali, para a tela mostrar o JSON. */
export class ErroGravacaoFatores extends ValidationError {
  chamadas: ChamadaErp[];
  constructor(message: string, chamadas: ChamadaErp[]) {
    super(message);
    this.name = "ErroGravacaoFatores";
    this.chamadas = chamadas;
  }
}

/*
 * Uma escrita (ou simulação) no ERP, registrada em `registro` como foi --
 * enviado, status e resposta. Recusa vira ErroGravacaoFatores com o
 * registro até ali; falha de rede sobe como está (com a resposta anotada).
 */
async function chamarErp<T>(
  ctx: ContextoErp,
  metodo: "POST" | "PUT",
  caminho: string,
  enviado: unknown,
  validar: boolean,
  rotulo: string,
  registro: ChamadaErp[]
): Promise<T[]> {
  const url = urlErp(ctx, validar ? `${caminho}/validar` : caminho);
  const chamada: ChamadaErp = { etapa: validar ? "simulacao" : "gravacao", metodo, url, enviado, status: null, resposta: null };
  registro.push(chamada);

  let resposta: Response;
  try {
    resposta = await fetch(url, {
      method: metodo,
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(120_000),
      body: JSON.stringify(enviado),
    });
  } catch (erro) {
    chamada.resposta = { erro: erro instanceof Error ? erro.message : String(erro) };
    throw erro;
  }
  const json = (await resposta.json().catch(() => null)) as { success?: boolean; detalhes?: T[] } | null;
  chamada.status = resposta.status;
  chamada.resposta = json;
  if (!resposta.ok || !json?.success) {
    throw new ErroGravacaoFatores(
      `${validar ? "Simulação da " : ""}${rotulo} recusada pelo ERP: ${mensagemDeErro(json, resposta.status)}`,
      registro
    );
  }
  return json.detalhes ?? [];
}

async function chamarFatores(
  ctx: ContextoErp,
  metodo: "POST" | "PUT",
  validar: boolean,
  linhas: LinhaFator[],
  registro: ChamadaErp[]
): Promise<DetalheErp[]> {
  const enviado = {
    cod_emp: ctx.codEmpresa,
    conversoes: linhas.map((l) => ({ cod_item: l.codigo, cod_unid_med_dest: UNIDADE_DESTINO, taxa: l.taxaProposta })),
  };
  return chamarErp<DetalheErp>(ctx, metodo, "/api/fator-conversao", enviado, validar, metodo === "POST" ? "inclusão" : "alteração", registro);
}

export interface ResultadoFatores {
  id: string;
  ambiente: "teste" | "producao";
  incluidos: number;
  alterados: number;
  erro: string | null;
  /* O que foi enviado ao ERP e o que ele respondeu, chamada a chamada. */
  chamadas: ChamadaErp[];
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
  const envios = [
    ...lotes(incluir).map((grupo) => ({ metodo: "POST" as const, grupo })),
    ...lotes(alterar).map((grupo) => ({ metodo: "PUT" as const, grupo })),
  ];
  const registro: ChamadaErp[] = [];

  /* Simula tudo antes de gravar qualquer coisa: se o ERP recusar qualquer lote, nada vai. */
  for (const { metodo, grupo } of envios) {
    try {
      await chamarFatores(ctx, metodo, true, grupo, registro);
    } catch (e) {
      if (e instanceof ErroGravacaoFatores) throw e;
      throw new ErroGravacaoFatores(`Não foi possível falar com o ERP: ${e instanceof Error ? e.message : String(e)}`, registro);
    }
  }

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
  for (const { metodo, grupo } of envios) {
    if (erro) break;
    try {
      for (const d of await chamarFatores(ctx, metodo, false, grupo, registro)) detalhes.set(String(d.cod_item), d);
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

  return { id, ambiente: ctx.ambiente, incluidos, alterados, erro, chamadas: registro };
}

/* ------------------------------------------------------------------ ajuste de peso (divergente) */

interface DetalhePesoErp {
  cod_item: string | number;
  acao?: string;
  peso_liq?: { antes: number | null; depois: number | null };
  peso_brt?: { antes: number | null; depois: number | null };
  fator_kg?: { acao?: string; id?: number; taxa?: { antes: number | null; depois: number | null }; leitura?: string } | null;
  avisos?: string[];
}

export interface ResultadoAjustePeso {
  id: string;
  ambiente: "teste" | "producao";
  codigo: string;
  pesoAntes: number | null;
  pesoDepois: number | null;
  brutoAntes: number | null;
  brutoDepois: number | null;
  taxaAntes: number | null;
  taxaDepois: number | null;
  leitura: string | null;
  avisos: string[];
  chamadas: ChamadaErp[];
}

/*
 * Peso divergente: o usuário diz qual é o peso certo (o da planilha, o do
 * ERP ou outro) e o Portal grava o peso líquido no cadastro do item e,
 * na mesma transação do ERP (ajustar_fator_kg), o fator unidade de
 * estoque -> KG = 1 / peso. O bruto só acompanha quando hoje segue a
 * proporção 1,1 x líquido. Simula antes (/validar); tudo-ou-nada no ERP.
 */
export async function ajustarPesoItem(
  conteudo: Buffer,
  nomeArquivo: string,
  codigo: string,
  peso: number,
  usuario: { id: string; nomeExibicao: string }
): Promise<ResultadoAjustePeso> {
  if (!Number.isFinite(peso) || peso <= 0 || peso >= 1e9) {
    throw new ValidationError("Informe um peso maior que zero (em kg).");
  }
  const analise = await analisarFatores(conteudo, nomeArquivo);
  const linha = analise.linhas.find((l) => l.codigo === codigo);
  if (!linha) throw new ValidationError(`O item ${codigo} não está nas abas do fator desta planilha.`);
  if (linha.situacao !== "peso_divergente") {
    throw new ValidationError(`O item ${codigo} não está mais com peso divergente. Confira de novo.`);
  }

  const config = await buscarConfigEngenhariaVersatil();
  const ctx = contexto(config);
  const erpAtual = (await consultarErp(ctx, [codigo])).get(codigo);
  const proporcional = manterProporcaoBruta(erpAtual?.pesoLiq ?? null, erpAtual?.pesoBrt);

  const enviado = {
    cod_emp: ctx.codEmpresa,
    ajustar_fator_kg: true,
    itens: [{ cod_item: codigo, peso_liq: peso, ...(proporcional ? { fator_bruto: FATOR_BRUTO_PADRAO } : {}) }],
  };
  const registro: ChamadaErp[] = [];

  try {
    await chamarErp<DetalhePesoErp>(ctx, "PUT", "/api/item/peso", enviado, true, "alteração de peso", registro);
  } catch (e) {
    if (e instanceof ErroGravacaoFatores) throw e;
    throw new ErroGravacaoFatores(`Não foi possível falar com o ERP: ${e instanceof Error ? e.message : String(e)}`, registro);
  }

  let detalhe: DetalhePesoErp | undefined;
  let erro: string | null = null;
  try {
    detalhe = (await chamarErp<DetalhePesoErp>(ctx, "PUT", "/api/item/peso", enviado, false, "alteração de peso", registro))[0];
  } catch (e) {
    if (e instanceof ErroGravacaoFatores) throw e;
    erro = e instanceof Error ? e.message : String(e);
  }

  /* Falhou depois de mandar: relê o ERP para registrar o que de fato ficou. */
  if (erro) {
    const relido = (await consultarErp(ctx, [codigo]).catch(() => null))?.get(codigo);
    const gravou = relido?.pesoLiq !== undefined && relido?.pesoLiq !== null && Math.abs(relido.pesoLiq - peso) <= 1e-6;
    if (!gravou) throw new ErroGravacaoFatores(`O ERP não confirmou a gravação: ${erro}`, registro);
    detalhe = {
      cod_item: codigo,
      acao: "ALTERADO",
      peso_liq: { antes: erpAtual?.pesoLiq ?? null, depois: relido!.pesoLiq },
      peso_brt: { antes: erpAtual?.pesoBrt ?? null, depois: relido!.pesoBrt ?? null },
      fator_kg: { acao: "ALTERADO", id: relido!.conversaoKg?.id, taxa: { antes: linha.taxaAtual, depois: relido!.conversaoKg?.taxa ?? null } },
      avisos: [`Resposta do ERP perdida (${erro}); confirmado relendo o ERP.`],
    };
  }

  const resultado = {
    pesoAntes: detalhe?.peso_liq?.antes ?? erpAtual?.pesoLiq ?? null,
    pesoDepois: detalhe?.peso_liq?.depois ?? peso,
    brutoAntes: detalhe?.peso_brt?.antes ?? erpAtual?.pesoBrt ?? null,
    brutoDepois: detalhe?.peso_brt?.depois ?? null,
    taxaAntes: detalhe?.fator_kg?.taxa?.antes ?? linha.taxaAtual,
    taxaDepois: detalhe?.fator_kg?.taxa?.depois ?? null,
    leitura: detalhe?.fator_kg?.leitura ?? null,
    avisos: detalhe?.avisos ?? [],
  };

  const pool = await getSqlServerPool();
  const criado = await pool
    .request()
    .input("numero", sql.NVarChar(30), analise.numeroProjeto)
    .input("arquivo", sql.NVarChar(300), nomeArquivo)
    .input("empresa", sql.Int, ctx.codEmpresa)
    .input("ambiente", sql.VarChar(10), ctx.ambiente)
    .input("incluidos", sql.Int, detalhe?.fator_kg?.acao === "INCLUIDO" ? 1 : 0)
    .input("alterados", sql.Int, detalhe?.fator_kg?.acao === "ALTERADO" ? 1 : 0)
    .input("usuarioId", sql.UniqueIdentifier, usuario.id)
    .input("usuarioNome", sql.NVarChar(200), usuario.nomeExibicao)
    .query<{ id: string }>(`
      INSERT INTO dbo.eng_versatil_fatores ([numero_projeto], [arquivo_planilha], [cod_empresa], [ambiente], [status], [incluidos], [alterados], [usuario_id], [usuario_nome])
      OUTPUT CONVERT(VARCHAR(36), INSERTED.[id]) AS [id]
      VALUES (@numero, @arquivo, @empresa, @ambiente, 'concluida', @incluidos, @alterados, @usuarioId, @usuarioNome);
    `);
  const id = criado.recordset[0].id;
  await pool
    .request()
    .input("fatorId", sql.UniqueIdentifier, id)
    .input("aba", sql.NVarChar(100), linha.aba)
    .input("codigo", sql.NVarChar(50), codigo)
    .input("unid", sql.NVarChar(10), linha.unidEstoque)
    .input("pesoPlanilha", sql.Decimal(18, 6), linha.pesoPlanilha)
    .input("pesoErp", sql.Decimal(18, 6), resultado.pesoAntes)
    .input("pesoNovo", sql.Decimal(18, 6), resultado.pesoDepois)
    .input("brtAntes", sql.Decimal(18, 6), resultado.brutoAntes)
    .input("brtNovo", sql.Decimal(18, 6), resultado.brutoDepois)
    .input("origem", sql.VarChar(10), origemDoPeso(peso, linha.pesoPlanilha, linha.pesoErp))
    .input("taxaAntes", sql.Decimal(21, 10), resultado.taxaAntes)
    .input("taxaNova", sql.Decimal(21, 10), resultado.taxaDepois)
    .input("conversaoId", sql.BigInt, detalhe?.fator_kg?.id ?? linha.conversaoId)
    .input("leitura", sql.NVarChar(200), resultado.leitura)
    .input("mensagem", sql.NVarChar(1000), resultado.avisos.join(" | ").slice(0, 1000) || null)
    .query(`
      INSERT INTO dbo.eng_versatil_fatores_itens
        ([fator_id], [ordem], [aba], [codigo], [unid_estoque], [peso_planilha], [peso_erp], [peso_novo], [peso_brt_antes], [peso_brt_novo],
         [origem_peso], [taxa_antes], [taxa_nova], [acao], [conversao_id], [leitura], [mensagem])
      VALUES (@fatorId, 1, @aba, @codigo, @unid, @pesoPlanilha, @pesoErp, @pesoNovo, @brtAntes, @brtNovo,
              @origem, @taxaAntes, @taxaNova, 'peso_e_fator', @conversaoId, @leitura, @mensagem);
    `);

  return { id, ambiente: ctx.ambiente, codigo, ...resultado, chamadas: registro };
}
