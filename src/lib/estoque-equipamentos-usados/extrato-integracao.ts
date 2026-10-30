import "server-only";

import { ValidationError } from "@/lib/auth/errors";
import { getSqlServerPool, sql } from "@/lib/database/sql-server";
import { registrarChamadaExternaSemFalhar } from "@/lib/monitoramento/chamadas-externas";

import { buscarConfigErpEstoqueUsados } from "./erp-integracao";
import { lerPdfNf, localizarPdfNfSaida } from "./nf-saida-pdf";
import path from "node:path";
import {
  LABEL_TIPO_ERP,
  TIPOS_IGNORADOS,
  decidirStatus,
  normalizarNumeroNf,
  ordenarMovimentos,
  regraDoTipo,
  statusSegundoErp,
  type AcaoPortal,
  type EquipamentoErp,
  type MovimentoErp,
  type StatusPortal,
} from "./extrato-regras";

/*
 * Integração pelo EXTRATO do item no ERP (GET /api/estoque-usados/extrato).
 *
 * Fluxo: a NF de entrada identifica o equipamento no ERP (código do item +
 * ID da máscara, ver nf-entrada-integracao.ts); daí em diante só o extrato
 * é consultado -- em lote (até 100 IDs do mesmo item por chamada), a cada
 * N minutos e pelo botão "Atualizar do ERP". O extrato vem sempre inteiro:
 * é o que permite notar NF cancelada (o movimento some do ERP).
 *
 * Por equipamento, numa transação:
 *  1. guarda/atualiza a cópia de cada movimentação do ERP;
 *  2. casa com a movimentação manual do Portal (mesmo tipo + mesma NF) ou
 *     cria a movimentação no extrato do Portal (origem "erp");
 *  3. aplica o status que o ERP indica (ver decidirStatus);
 *  4. grava a situação atual do ERP no equipamento.
 * Equipamento baixado no Portal não é mais consultado.
 */

const LOTE_IDS = 100;
const TIMEOUT_MS = 60_000;
const NOME_INTEGRACAO = "Integração ERP";

export interface ResultadoSincronizacao {
  equipamentoId: string;
  numero: number;
  statusAntes: StatusPortal;
  statusDepois: StatusPortal;
  motivoStatus: string;
  movimentosErpNovos: number;
  movimentosErpRemovidos: number;
  movimentacoesCriadas: number;
  movimentacoesVinculadas: number;
  movimentacoesRemovidas: number;
  pdfsAnexados: number;
  erro: string | null;
}

interface Candidato {
  id: string;
  numero: number;
  status: StatusPortal;
  codigoEmpresa: string | null;
  codItem: string;
  idErp: string;
  erroAnterior: string | null;
}

interface RespostaExtrato {
  success?: boolean;
  data?: EquipamentoErp[];
  naoEncontrados?: { id: number | string; motivo?: string | null }[];
  message?: string;
}

/* ---------- consulta ao ERP ---------- */

async function consultarExtrato(
  url: string,
  chaveApi: string | null,
  codItem: string,
  ids: string[]
): Promise<{ porId: Map<string, EquipamentoErp>; naoEncontrados: Map<string, string>; requestUrl: string }> {
  const endereco = new URL(url);
  endereco.searchParams.set("cod_item", codItem);
  endereco.searchParams.set("id", ids.join(","));
  const requestUrl = endereco.toString();

  const inicio = performance.now();
  let sucesso = false;
  let mensagemErro: string | null = null;

  try {
    const resposta = await fetch(requestUrl, {
      headers: { Accept: "application/json", ...(chaveApi ? { Authorization: `Bearer ${chaveApi}` } : {}) },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const corpo = (await resposta.json().catch(() => null)) as RespostaExtrato | null;

    /* 404 = nenhum dos IDs existe no ERP: não é falha da integração. */
    if (!resposta.ok && resposta.status !== 404) {
      throw new Error(corpo?.message || `O ERP respondeu HTTP ${resposta.status} no extrato.`);
    }

    const porId = new Map<string, EquipamentoErp>();
    for (const equipamento of corpo?.data ?? []) {
      for (const mascara of equipamento.mascaras ?? []) porId.set(String(mascara.id), equipamento);
    }
    const naoEncontrados = new Map<string, string>();
    for (const item of corpo?.naoEncontrados ?? []) {
      naoEncontrados.set(String(item.id), item.motivo || "Não encontrado no ERP.");
    }
    if (resposta.status === 404) {
      for (const id of ids) if (!naoEncontrados.has(id)) naoEncontrados.set(id, corpo?.message || "Não encontrado no ERP.");
    }

    sucesso = true;
    return { porId, naoEncontrados, requestUrl };
  } catch (erro) {
    mensagemErro = erro instanceof Error ? erro.message : "Falha ao consultar o extrato.";
    throw new Error(mensagemErro);
  } finally {
    await registrarChamadaExternaSemFalhar({
      servico: "erp_estoque_usados_extrato",
      origem: "uso_real",
      sucesso,
      duracaoMs: performance.now() - inicio,
      mensagemErro,
    });
  }
}

/* ---------- candidatos ---------- */

async function listarCandidatos(equipamentoIds?: string[]): Promise<Candidato[]> {
  const pool = await getSqlServerPool();
  const request = pool.request();
  let filtroIds = "";
  if (equipamentoIds?.length) {
    equipamentoIds.forEach((id, i) => request.input(`id${i}`, sql.UniqueIdentifier, id));
    filtroIds = `AND [id] IN (${equipamentoIds.map((_, i) => `@id${i}`).join(", ")})`;
  }
  const resultado = await request.query<{
    id: string;
    numero: number;
    status: StatusPortal;
    codigo_empresa: string | null;
    erp_codigo_item: string;
    erp_id_item: string;
    erp_extrato_erro: string | null;
  }>(`
    SELECT CONVERT(VARCHAR(36), [id]) AS [id], [numero], [status], [codigo_empresa],
           LTRIM(RTRIM([erp_codigo_item])) AS [erp_codigo_item], LTRIM(RTRIM([erp_id_item])) AS [erp_id_item], [erp_extrato_erro]
    FROM dbo.com_estoque_equipamentos_usados
    WHERE [status] <> 'baixado'
      AND [erp_codigo_item] IS NOT NULL AND LTRIM(RTRIM([erp_codigo_item])) <> ''
      AND [erp_id_item] IS NOT NULL AND LTRIM(RTRIM([erp_id_item])) <> ''
      ${filtroIds}
    ORDER BY [numero];
  `);
  return resultado.recordset.map((r) => ({
    id: r.id,
    numero: r.numero,
    status: r.status,
    codigoEmpresa: r.codigo_empresa,
    codItem: r.erp_codigo_item,
    idErp: r.erp_id_item,
    erroAnterior: r.erp_extrato_erro,
  }));
}

/* ---------- gravação ---------- */

function texto(valor: unknown, max: number): string | null {
  if (valor === null || valor === undefined) return null;
  const t = String(valor).trim();
  return t ? t.slice(0, max) : null;
}

function numero(valor: unknown): number | null {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : null;
}

function data(valor: unknown): string | null {
  return typeof valor === "string" && /^\d{4}-\d{2}-\d{2}/.test(valor) ? valor.slice(0, 10) : null;
}

async function upsertMovimentoErp(transacao: sql.Transaction, equipamentoId: string, m: MovimentoErp): Promise<boolean> {
  const v = m.valores ?? {};
  const resultado = await new sql.Request(transacao)
    .input("equip", sql.UniqueIdentifier, equipamentoId)
    .input("idMov", sql.VarChar(40), m.idMovimentacao.slice(0, 40))
    .input("codEmp", sql.Int, numero(m.codEmp))
    .input("data", sql.Date, data(m.data))
    .input("sentido", sql.VarChar(10), texto(m.sentido, 10) ?? "-")
    .input("tipo", sql.VarChar(40), m.tipo.slice(0, 40))
    .input("modalidade", sql.VarChar(30), texto(m.modalidade, 30))
    .input("nfNumero", sql.VarChar(20), texto(m.documento?.numero, 20))
    .input("nfSerie", sql.VarChar(10), texto(m.documento?.serie, 10))
    .input("nfChave", sql.VarChar(60), texto(m.documento?.chaveAcesso, 60))
    .input("nfSituacao", sql.VarChar(5), texto(m.documento?.situacao, 5))
    .input("nfEmissao", sql.Date, data(m.documento?.dataEmissao))
    .input("cfop", sql.Int, numero(m.cfop))
    .input("natureza", sql.NVarChar(200), texto(m.naturezaOperacao, 200))
    .input("tipoNf", sql.NVarChar(200), texto(m.tipoNf?.descricao, 200))
    .input("cpNome", sql.NVarChar(200), texto(m.contraparte?.nome, 200))
    .input("cpCnpj", sql.VarChar(20), texto(m.contraparte?.cnpjCpf, 20))
    .input("almoxOrigem", sql.NVarChar(100), texto(m.almoxarifadoOrigem?.descricao, 100))
    .input("almoxDestino", sql.NVarChar(100), texto(m.almoxarifadoDestino?.descricao, 100))
    .input("qtde", sql.Decimal(14, 4), numero(m.quantidade))
    .input("vUnit", sql.Decimal(14, 2), numero(v.unitarioNf))
    .input("vItem", sql.Decimal(14, 2), numero(v.totalItemNf))
    .input("vNf", sql.Decimal(14, 2), numero(v.totalNf))
    .input("vCusto", sql.Decimal(14, 2), numero(v.custoCompra))
    .input("vEstoque", sql.Decimal(14, 2), numero(v.valorEstoque))
    .input("localDepois", sql.VarChar(20), texto(m.saldoDepois?.local, 20))
    .input("vendaConsig", sql.Bit, typeof m.vendaDeConsignacao === "boolean" ? m.vendaDeConsignacao : null)
    .input("dados", sql.NVarChar(sql.MAX), JSON.stringify(m))
    .query<{ acao: string }>(`
      MERGE dbo.com_estoque_equipamentos_usados_erp_movimentos AS d
      USING (SELECT @equip AS equipamento_id, @idMov AS id_movimentacao) AS o
        ON d.[equipamento_id] = o.equipamento_id AND d.[id_movimentacao] = o.id_movimentacao
      WHEN MATCHED THEN UPDATE SET
        [cod_emp] = @codEmp, [data_movimento] = @data, [sentido] = @sentido, [tipo] = @tipo, [modalidade] = @modalidade,
        [nf_numero] = @nfNumero, [nf_serie] = @nfSerie, [nf_chave] = @nfChave, [nf_situacao] = @nfSituacao,
        [nf_data_emissao] = @nfEmissao, [cfop] = @cfop, [natureza_operacao] = @natureza, [tipo_nf_descricao] = @tipoNf,
        [contraparte_nome] = @cpNome, [contraparte_cnpj] = @cpCnpj, [almox_origem] = @almoxOrigem, [almox_destino] = @almoxDestino,
        [quantidade] = @qtde, [valor_unitario] = @vUnit, [valor_total_item] = @vItem, [valor_total_nf] = @vNf,
        [custo_compra] = @vCusto, [valor_estoque] = @vEstoque, [local_depois] = @localDepois,
        [venda_de_consignacao] = @vendaConsig, [dados] = @dados, [atualizado_em] = SYSDATETIME(), [removido_em] = NULL
      WHEN NOT MATCHED THEN INSERT
        ([equipamento_id], [id_movimentacao], [cod_emp], [data_movimento], [sentido], [tipo], [modalidade], [nf_numero], [nf_serie],
         [nf_chave], [nf_situacao], [nf_data_emissao], [cfop], [natureza_operacao], [tipo_nf_descricao], [contraparte_nome],
         [contraparte_cnpj], [almox_origem], [almox_destino], [quantidade], [valor_unitario], [valor_total_item], [valor_total_nf],
         [custo_compra], [valor_estoque], [local_depois], [venda_de_consignacao], [dados])
        VALUES (@equip, @idMov, @codEmp, @data, @sentido, @tipo, @modalidade, @nfNumero, @nfSerie, @nfChave, @nfSituacao, @nfEmissao,
         @cfop, @natureza, @tipoNf, @cpNome, @cpCnpj, @almoxOrigem, @almoxDestino, @qtde, @vUnit, @vItem, @vNf, @vCusto, @vEstoque,
         @localDepois, @vendaConsig, @dados)
      OUTPUT $action AS acao;
    `);
  return resultado.recordset[0]?.acao === "INSERT";
}

interface MovimentacaoPortal {
  id: string;
  tipoAcao: string;
  numeroNf: string | null;
  origem: string;
  erpIdMovimentacao: string | null;
  dataAcao: string;
}

async function listarMovimentacoesPortal(transacao: sql.Transaction, equipamentoId: string): Promise<MovimentacaoPortal[]> {
  const resultado = await new sql.Request(transacao).input("equip", sql.UniqueIdentifier, equipamentoId).query<{
    id: string;
    tipo_acao: string;
    numero_nf: string | null;
    origem: string;
    erp_id_movimentacao: string | null;
    data_acao: string;
  }>(`
    SELECT CONVERT(VARCHAR(36), [id]) AS [id], [tipo_acao], [numero_nf], [origem], [erp_id_movimentacao],
           CONVERT(VARCHAR(10), [data_acao], 23) AS [data_acao]
    FROM dbo.com_estoque_equipamentos_usados_movimentacoes
    WHERE [equipamento_id] = @equip
    ORDER BY [data_acao], [criado_em];
  `);
  return resultado.recordset.map((r) => ({
    id: r.id,
    tipoAcao: r.tipo_acao,
    numeroNf: r.numero_nf,
    origem: r.origem,
    erpIdMovimentacao: r.erp_id_movimentacao,
    dataAcao: r.data_acao,
  }));
}

const ACOES_QUE_MUDAM_STATUS = new Set<string>(["emprestimo", "consignacao", "reforma", "retorno", "baixa"]);

async function aplicarExtrato(
  transacao: sql.Transaction,
  candidato: Candidato,
  equipamento: EquipamentoErp
): Promise<Omit<ResultadoSincronizacao, "equipamentoId" | "numero" | "erro" | "pdfsAnexados">> {
  const movimentos = ordenarMovimentos(equipamento.movimentacoes ?? []).filter((m) => m.idMovimentacao && m.data);
  const relevantes = movimentos.filter((m) => !TIPOS_IGNORADOS.has(m.tipo));

  /* 1. cópia do extrato */
  let movimentosErpNovos = 0;
  for (const m of relevantes) if (await upsertMovimentoErp(transacao, candidato.id, m)) movimentosErpNovos += 1;

  /* NF cancelada some do ERP: marca como removida (só com extrato não vazio, por segurança). */
  let removidos: string[] = [];
  if (relevantes.length > 0) {
    const req = new sql.Request(transacao).input("equip", sql.UniqueIdentifier, candidato.id);
    relevantes.forEach((m, i) => req.input(`m${i}`, sql.VarChar(40), m.idMovimentacao.slice(0, 40)));
    const r = await req.query<{ id_movimentacao: string }>(`
      UPDATE dbo.com_estoque_equipamentos_usados_erp_movimentos
      SET [removido_em] = SYSDATETIME()
      OUTPUT INSERTED.[id_movimentacao]
      WHERE [equipamento_id] = @equip AND [removido_em] IS NULL
        AND [id_movimentacao] NOT IN (${relevantes.map((_, i) => `@m${i}`).join(", ")});
    `);
    removidos = r.recordset.map((x) => x.id_movimentacao);
  }

  let movimentacoesRemovidas = 0;
  for (const idMov of removidos) {
    const r = await new sql.Request(transacao)
      .input("equip", sql.UniqueIdentifier, candidato.id)
      .input("idMov", sql.VarChar(40), idMov)
      .query(`
        DELETE FROM dbo.com_estoque_equipamentos_usados_movimentacoes
        WHERE [equipamento_id] = @equip AND [origem] = 'erp' AND [erp_id_movimentacao] = @idMov;
        UPDATE dbo.com_estoque_equipamentos_usados_movimentacoes SET [erp_id_movimentacao] = NULL
        WHERE [equipamento_id] = @equip AND [origem] = 'portal' AND [erp_id_movimentacao] = @idMov;
      `);
    movimentacoesRemovidas += r.rowsAffected[0] ?? 0;
  }

  /* 2. extrato do Portal: casa com a manual ou cria */
  const portal = await listarMovimentacoesPortal(transacao, candidato.id);
  const vinculados = new Set(portal.map((p) => p.erpIdMovimentacao).filter(Boolean));
  let movimentacoesCriadas = 0;
  let movimentacoesVinculadas = 0;
  let statusCorrente: StatusPortal = "em_estoque";

  for (const m of relevantes) {
    const regra = regraDoTipo(m.tipo);
    const statusDepois: StatusPortal = regra.status ?? statusCorrente;
    statusCorrente = statusDepois;
    if (!regra.acao || vinculados.has(m.idMovimentacao)) continue;

    const nf = normalizarNumeroNf(m.documento?.numero);
    const manual = portal.find(
      (p) =>
        p.origem === "portal" &&
        !p.erpIdMovimentacao &&
        (p.tipoAcao === regra.acao || (regra.acao === "entrada" && p.tipoAcao === "nf_vinculada")) &&
        nf !== null &&
        normalizarNumeroNf(p.numeroNf) === nf
    );

    if (manual) {
      await new sql.Request(transacao)
        .input("id", sql.UniqueIdentifier, manual.id)
        .input("idMov", sql.VarChar(40), m.idMovimentacao.slice(0, 40))
        .query(`UPDATE dbo.com_estoque_equipamentos_usados_movimentacoes SET [erp_id_movimentacao] = @idMov WHERE [id] = @id;`);
      manual.erpIdMovimentacao = m.idMovimentacao;
      vinculados.add(m.idMovimentacao);
      movimentacoesVinculadas += 1;
      continue;
    }

    /* A compra só confirma a entrada que o Portal já tem; nunca cria outra. */
    if (regra.acao === "entrada") continue;

    const rotulo = LABEL_TIPO_ERP[m.tipo] ?? m.tipo;
    const observacao = [rotulo, m.cfop ? `CFOP ${m.cfop}` : null, "importado do ERP"].filter(Boolean).join(" · ");
    await new sql.Request(transacao)
      .input("equip", sql.UniqueIdentifier, candidato.id)
      .input("tipo", sql.VarChar(20), regra.acao as AcaoPortal)
      .input("nf", sql.NVarChar(30), texto(m.documento?.numero, 30))
      .input("dest", sql.NVarChar(200), texto(m.contraparte?.nome, 200))
      .input("motivo", sql.VarChar(20), regra.acao === "baixa" ? "venda" : null)
      .input("status", sql.VarChar(20), statusDepois)
      .input("obs", sql.NVarChar(1000), observacao)
      .input("data", sql.Date, data(m.data))
      .input("nome", sql.NVarChar(150), NOME_INTEGRACAO)
      .input("valor", sql.Decimal(12, 2), numero(m.valores?.totalItemNf))
      .input("emissao", sql.Date, data(m.documento?.dataEmissao))
      .input("idMov", sql.VarChar(40), m.idMovimentacao.slice(0, 40))
      .query(`
        INSERT INTO dbo.com_estoque_equipamentos_usados_movimentacoes
          ([equipamento_id], [tipo_acao], [numero_nf], [destinatario_nome], [motivo_baixa], [status_resultante], [observacoes],
           [data_acao], [criado_por_usuario_id], [criado_por_nome], [valor], [data_emissao_nf], [origem], [erp_id_movimentacao])
        VALUES (@equip, @tipo, @nf, @dest, @motivo, @status, @obs, @data, NULL, @nome, @valor, @emissao, 'erp', @idMov);
      `);
    vinculados.add(m.idMovimentacao);
    movimentacoesCriadas += 1;
  }

  /* 3. status: vale o ERP, salvo manual recente esperando a NF */
  const { status: statusErp, movimento } = statusSegundoErp(relevantes);
  const pendente = [...portal]
    .reverse()
    .find((p) => p.origem === "portal" && !p.erpIdMovimentacao && ACOES_QUE_MUDAM_STATUS.has(p.tipoAcao));
  const hoje = new Date().toLocaleDateString("sv-SE");
  const decisao = decidirStatus({
    statusPortal: candidato.status,
    statusErp,
    dataMovimentoErp: movimento?.data ?? null,
    manualPendente: pendente ? { tipoAcao: pendente.tipoAcao as AcaoPortal, dataAcao: pendente.dataAcao } : null,
    hoje,
  });

  /* 4. situação no ERP (+ status, se mudou) */
  const situacao = equipamento.situacaoAtual ?? {};
  const contraparte = typeof situacao.contraparte === "string" ? situacao.contraparte : situacao.contraparte?.nome;
  const codEmpAtual = numero(situacao.codEmp);
  await new sql.Request(transacao)
    .input("id", sql.UniqueIdentifier, candidato.id)
    .input("status", sql.VarChar(20), decisao.novoStatus)
    .input("local", sql.VarChar(20), texto(situacao.local, 20))
    .input("desde", sql.Date, data(situacao.desde))
    .input("codEmp", sql.Int, codEmpAtual)
    .input("contraparte", sql.NVarChar(200), texto(contraparte, 200))
    .input("custo", sql.Decimal(14, 2), numero(equipamento.custoCompra))
    .input("empresaNova", sql.NVarChar(20), codEmpAtual !== null && situacao.local === "EM_ESTOQUE" ? String(codEmpAtual) : null)
    .query(`
      UPDATE dbo.com_estoque_equipamentos_usados
      SET [status] = @status,
          [erp_local] = @local, [erp_local_desde] = @desde, [erp_cod_emp_atual] = @codEmp,
          [erp_contraparte_atual] = @contraparte, [erp_custo_compra] = @custo,
          [erp_extrato_em] = SYSDATETIME(), [erp_extrato_erro] = NULL,
          /* Transferência: troca a empresa do cadastro só se ela existir no Portal. */
          [codigo_empresa] = CASE WHEN @empresaNova IS NOT NULL AND @empresaNova <> ISNULL([codigo_empresa], '')
                                   AND EXISTS (SELECT 1 FROM dbo.portal_empresas WHERE [codigo] = @empresaNova)
                                  THEN @empresaNova ELSE [codigo_empresa] END,
          [atualizado_em] = CASE WHEN @status <> [status] THEN SYSDATETIME() ELSE [atualizado_em] END
      WHERE [id] = @id;
    `);

  return {
    statusAntes: candidato.status,
    statusDepois: decisao.novoStatus,
    motivoStatus: decisao.motivo,
    movimentosErpNovos,
    movimentosErpRemovidos: removidos.length,
    movimentacoesCriadas,
    movimentacoesVinculadas,
    movimentacoesRemovidas,
  };
}

/*
 * Anexa o PDF das NFs de SAÍDA nossas (emitidas pela empresa da pasta
 * configurada) às movimentações do extrato do Portal. Roda depois da
 * transação, porque lê da rede. Não achou: tenta de novo no dia seguinte
 * (ou na hora, quando alguém clicou). Falha de rede não derruba a sincronização.
 */
async function anexarPdfsNfSaida(params: {
  equipamentoId: string;
  numeroEquipamento: number;
  pasta: string;
  codEmp: number;
  forcar: boolean;
}): Promise<number> {
  const pool = await getSqlServerPool();
  const pendentes = await pool
    .request()
    .input("equip", sql.UniqueIdentifier, params.equipamentoId)
    .input("codEmp", sql.Int, params.codEmp)
    .input("forcar", sql.Bit, params.forcar)
    .query<{ id: string; nf_numero: string; data_emissao: string; movimentacao_id: string }>(`
      SELECT CONVERT(VARCHAR(36), em.[id]) AS [id], em.[nf_numero],
             CONVERT(VARCHAR(10), ISNULL(em.[nf_data_emissao], em.[data_movimento]), 23) AS [data_emissao],
             CONVERT(VARCHAR(36), mov.[id]) AS [movimentacao_id]
      FROM dbo.com_estoque_equipamentos_usados_erp_movimentos em
      JOIN dbo.com_estoque_equipamentos_usados_movimentacoes mov
        ON mov.[equipamento_id] = em.[equipamento_id] AND mov.[erp_id_movimentacao] = em.[id_movimentacao]
      WHERE em.[equipamento_id] = @equip
        AND em.[removido_em] IS NULL
        AND em.[sentido] = 'SAIDA'
        AND em.[cod_emp] = @codEmp
        AND em.[nf_numero] IS NOT NULL
        AND JSON_VALUE(em.[dados], '$.documento.origem') = 'NF_SAIDA'
        AND em.[nf_pdf_anexo_id] IS NULL
        AND (@forcar = 1 OR em.[nf_pdf_procurado_em] IS NULL OR em.[nf_pdf_procurado_em] < DATEADD(DAY, -1, SYSDATETIME()));
    `);

  let anexados = 0;
  for (const p of pendentes.recordset) {
    try {
      const caminho = await localizarPdfNfSaida({
        pastaBase: params.pasta,
        numeroNf: p.nf_numero,
        dataEmissao: p.data_emissao,
        numeroEquipamento: params.numeroEquipamento,
      });
      const conteudo = caminho ? await lerPdfNf(caminho) : null;

      if (caminho && conteudo) {
        await pool
          .request()
          .input("mov", sql.UniqueIdentifier, p.movimentacao_id)
          .input("nome", sql.NVarChar(260), path.basename(caminho).slice(0, 260))
          .input("tamanho", sql.Int, conteudo.length)
          .input("conteudo", sql.VarBinary(sql.MAX), conteudo)
          .input("nomeCriador", sql.NVarChar(150), NOME_INTEGRACAO)
          .input("emId", sql.UniqueIdentifier, p.id)
          .input("arquivo", sql.NVarChar(400), caminho.slice(0, 400))
          .query(`
            DECLARE @anexo TABLE ([id] UNIQUEIDENTIFIER);
            INSERT INTO dbo.com_estoque_movimentacoes_anexos
              ([movimentacao_id], [nome_arquivo], [tipo_mime], [tamanho_bytes], [conteudo], [criado_por_usuario_id], [criado_por_nome])
            OUTPUT INSERTED.[id] INTO @anexo
            VALUES (@mov, @nome, 'application/pdf', @tamanho, @conteudo, NULL, @nomeCriador);
            UPDATE dbo.com_estoque_equipamentos_usados_erp_movimentos
            SET [nf_pdf_anexo_id] = (SELECT TOP 1 [id] FROM @anexo), [nf_pdf_arquivo] = @arquivo, [nf_pdf_procurado_em] = SYSDATETIME()
            WHERE [id] = @emId;
          `);
        anexados += 1;
      } else {
        await pool
          .request()
          .input("emId", sql.UniqueIdentifier, p.id)
          .query(`UPDATE dbo.com_estoque_equipamentos_usados_erp_movimentos SET [nf_pdf_procurado_em] = SYSDATETIME() WHERE [id] = @emId;`);
      }
    } catch (erro) {
      console.error(`Erro ao anexar o PDF da NF ${p.nf_numero} (equipamento ${params.numeroEquipamento}):`, erro);
    }
  }
  return anexados;
}

async function registrarLogExtrato(params: {
  equipamentoId: string;
  status: "sucesso" | "erro" | "nao_encontrado";
  mensagem: string;
  parametros: string;
  disparadoPor: string | null;
  requestUrl: string | null;
}): Promise<void> {
  try {
    const pool = await getSqlServerPool();
    await pool
      .request()
      .input("equip", sql.UniqueIdentifier, params.equipamentoId)
      .input("status", sql.NVarChar(20), params.status)
      .input("mensagem", sql.NVarChar(500), params.mensagem.slice(0, 500))
      .input("parametros", sql.NVarChar(300), params.parametros.slice(0, 300))
      .input("por", sql.NVarChar(150), params.disparadoPor)
      .input("url", sql.NVarChar(500), params.requestUrl?.slice(0, 500) ?? null)
      .query(`
        INSERT INTO dbo.com_estoque_integracao_nf_logs
          ([equipamento_id], [tipo_nf], [finalizado_em], [status], [mensagem], [parametros_consulta], [disparado_por], [request_url])
        VALUES (@equip, 'extrato', SYSDATETIME(), @status, @mensagem, @parametros, @por, @url);
      `);
  } catch (erro) {
    console.error("Erro ao registrar log do extrato (equipamentos usados):", erro);
  }
}

async function registrarErro(candidato: Candidato, mensagem: string, disparadoPor: string | null, requestUrl: string | null, simular: boolean) {
  if (simular) return;
  const pool = await getSqlServerPool();
  await pool
    .request()
    .input("id", sql.UniqueIdentifier, candidato.id)
    .input("erro", sql.NVarChar(500), mensagem.slice(0, 500))
    .query(`UPDATE dbo.com_estoque_equipamentos_usados SET [erp_extrato_erro] = @erro, [erp_extrato_em] = SYSDATETIME() WHERE [id] = @id;`);
  /* O mesmo erro a cada hora não enche o log: só registra quando muda (ou quando alguém clicou). */
  if (disparadoPor || candidato.erroAnterior !== mensagem.slice(0, 500)) {
    await registrarLogExtrato({
      equipamentoId: candidato.id,
      status: /não encontrad/i.test(mensagem) ? "nao_encontrado" : "erro",
      mensagem,
      parametros: `cod_item=${candidato.codItem}&id=${candidato.idErp}`,
      disparadoPor,
      requestUrl,
    });
  }
}

/* ---------- entrada pública ---------- */

/*
 * Sincroniza pelo extrato. Sem equipamentoIds: todos os não baixados já
 * identificados no ERP (o agendador). simular=true roda tudo e desfaz no
 * fim -- serve para ver o que mudaria antes de ligar a integração.
 */
export async function sincronizarExtrato(params: {
  equipamentoIds?: string[];
  disparadoPor: string | null;
  simular?: boolean;
}): Promise<ResultadoSincronizacao[]> {
  const config = await buscarConfigErpEstoqueUsados();
  const url = config.usarAmbienteTeste ? config.urlExtratoTeste : config.urlExtrato;
  if (!url) {
    throw new ValidationError(
      `Configure a URL ${config.usarAmbienteTeste ? "de teste" : "de produção"} do extrato do item em Administração → Equipamentos Usados → Integração ERP.`
    );
  }

  const simular = params.simular === true;
  const candidatos = await listarCandidatos(params.equipamentoIds);
  const porItem = new Map<string, Candidato[]>();
  for (const c of candidatos) porItem.set(c.codItem, [...(porItem.get(c.codItem) ?? []), c]);

  const resultados: ResultadoSincronizacao[] = [];
  const vazio = (c: Candidato, erro: string): ResultadoSincronizacao => ({
    equipamentoId: c.id,
    numero: c.numero,
    statusAntes: c.status,
    statusDepois: c.status,
    motivoStatus: "",
    movimentosErpNovos: 0,
    movimentosErpRemovidos: 0,
    movimentacoesCriadas: 0,
    movimentacoesVinculadas: 0,
    movimentacoesRemovidas: 0,
    pdfsAnexados: 0,
    erro,
  });

  for (const [codItem, doItem] of porItem) {
    for (let inicio = 0; inicio < doItem.length; inicio += LOTE_IDS) {
      const lote = doItem.slice(inicio, inicio + LOTE_IDS);

      let consulta: Awaited<ReturnType<typeof consultarExtrato>>;
      try {
        consulta = await consultarExtrato(url, config.chaveApi, codItem, lote.map((c) => c.idErp));
      } catch (erro) {
        const mensagem = erro instanceof Error ? erro.message : "Falha ao consultar o extrato.";
        for (const c of lote) {
          await registrarErro(c, mensagem, params.disparadoPor, null, simular);
          resultados.push(vazio(c, mensagem));
        }
        continue;
      }

      for (const candidato of lote) {
        const equipamento = consulta.porId.get(candidato.idErp);
        if (!equipamento) {
          const mensagem = consulta.naoEncontrados.get(candidato.idErp) ?? "Não encontrado no extrato do ERP.";
          await registrarErro(candidato, mensagem, params.disparadoPor, consulta.requestUrl, simular);
          resultados.push(vazio(candidato, mensagem));
          continue;
        }

        const pool = await getSqlServerPool();
        const transacao = new sql.Transaction(pool);
        await transacao.begin();
        try {
          const r = await aplicarExtrato(transacao, candidato, equipamento);
          if (simular) await transacao.rollback();
          else await transacao.commit();

          const pdfsAnexados =
            !simular && config.pastaPdfNfSaida && config.codEmpPdfNfSaida
              ? await anexarPdfsNfSaida({
                  equipamentoId: candidato.id,
                  numeroEquipamento: candidato.numero,
                  pasta: config.pastaPdfNfSaida,
                  codEmp: config.codEmpPdfNfSaida,
                  forcar: Boolean(params.disparadoPor),
                })
              : 0;

          const resultado: ResultadoSincronizacao = {
            equipamentoId: candidato.id,
            numero: candidato.numero,
            erro: null,
            ...r,
            pdfsAnexados,
          };
          resultados.push(resultado);

          const mudou =
            r.statusAntes !== r.statusDepois ||
            r.movimentacoesCriadas + r.movimentacoesVinculadas + r.movimentacoesRemovidas + r.movimentosErpNovos + pdfsAnexados > 0;
          if (!simular && (mudou || params.disparadoPor)) {
            const partes = [
              r.statusAntes !== r.statusDepois ? `Status: ${r.statusAntes} → ${r.statusDepois}` : null,
              r.movimentosErpNovos ? `${r.movimentosErpNovos} movimento(s) novo(s) no ERP` : null,
              r.movimentacoesCriadas ? `${r.movimentacoesCriadas} lançada(s) no extrato` : null,
              r.movimentacoesVinculadas ? `${r.movimentacoesVinculadas} confirmada(s) pela NF` : null,
              r.movimentosErpRemovidos ? `${r.movimentosErpRemovidos} cancelada(s) no ERP` : null,
              pdfsAnexados ? `${pdfsAnexados} PDF(s) de NF anexado(s)` : null,
            ].filter(Boolean);
            await registrarLogExtrato({
              equipamentoId: candidato.id,
              status: "sucesso",
              mensagem: partes.length ? partes.join("; ") : "Extrato conferido, sem mudanças.",
              parametros: `cod_item=${codItem}&id=${candidato.idErp}`,
              disparadoPor: params.disparadoPor,
              requestUrl: consulta.requestUrl,
            });
          }
        } catch (erro) {
          await transacao.rollback().catch(() => undefined);
          const mensagem = erro instanceof Error ? erro.message : "Falha ao aplicar o extrato.";
          console.error(`Erro ao aplicar o extrato do equipamento ${candidato.numero}:`, erro);
          await registrarErro(candidato, `Falha ao aplicar o extrato: ${mensagem}`, params.disparadoPor, consulta.requestUrl, simular);
          resultados.push(vazio(candidato, mensagem));
        }
      }
    }
  }

  return resultados;
}

/* ---------- leitura para a tela do equipamento ---------- */

export interface MovimentoErpGravado {
  idMovimentacao: string;
  data: string;
  tipo: string;
  tipoLabel: string;
  sentido: string;
  nfNumero: string | null;
  nfSerie: string | null;
  nfDataEmissao: string | null;
  cfop: number | null;
  naturezaOperacao: string | null;
  contraparteNome: string | null;
  contraparteCnpj: string | null;
  valorTotalItem: number | null;
  custoCompra: number | null;
  localDepois: string | null;
  vendaDeConsignacao: boolean | null;
  removido: boolean;
}

export interface SituacaoErpEquipamento {
  local: string | null;
  desde: string | null;
  codEmp: number | null;
  contraparte: string | null;
  custoCompra: number | null;
  sincronizadoEm: string | null;
  erro: string | null;
  movimentos: MovimentoErpGravado[];
}

export async function buscarSituacaoErp(equipamentoId: string): Promise<SituacaoErpEquipamento | null> {
  const pool = await getSqlServerPool();
  const r = await pool.request().input("id", sql.UniqueIdentifier, equipamentoId).query(`
    SELECT [erp_local], CONVERT(VARCHAR(10), [erp_local_desde], 23) AS [erp_local_desde], [erp_cod_emp_atual],
           [erp_contraparte_atual], [erp_custo_compra], CONVERT(VARCHAR(33), [erp_extrato_em], 126) AS [erp_extrato_em],
           [erp_extrato_erro]
    FROM dbo.com_estoque_equipamentos_usados WHERE [id] = @id;

    SELECT [id_movimentacao], CONVERT(VARCHAR(10), [data_movimento], 23) AS [data_movimento], [tipo], [sentido], [nf_numero],
           [nf_serie], CONVERT(VARCHAR(10), [nf_data_emissao], 23) AS [nf_data_emissao], [cfop], [natureza_operacao], [contraparte_nome], [contraparte_cnpj], [valor_total_item], [custo_compra],
           [local_depois], [venda_de_consignacao], CASE WHEN [removido_em] IS NULL THEN 0 ELSE 1 END AS [removido]
    FROM dbo.com_estoque_equipamentos_usados_erp_movimentos
    WHERE [equipamento_id] = @id
    ORDER BY [data_movimento] DESC, [importado_em] DESC;
  `);
  const [equipamentos, movimentos] = r.recordsets as unknown as [Record<string, unknown>[], Record<string, unknown>[]];
  const e = equipamentos[0];
  if (!e) return null;
  return {
    local: (e.erp_local as string | null) ?? null,
    desde: (e.erp_local_desde as string | null) ?? null,
    codEmp: (e.erp_cod_emp_atual as number | null) ?? null,
    contraparte: (e.erp_contraparte_atual as string | null) ?? null,
    custoCompra: e.erp_custo_compra === null ? null : Number(e.erp_custo_compra),
    sincronizadoEm: (e.erp_extrato_em as string | null) ?? null,
    erro: (e.erp_extrato_erro as string | null) ?? null,
    movimentos: movimentos.map((m) => ({
      idMovimentacao: m.id_movimentacao as string,
      data: m.data_movimento as string,
      tipo: m.tipo as string,
      tipoLabel: LABEL_TIPO_ERP[m.tipo as string] ?? (m.tipo as string),
      sentido: m.sentido as string,
      nfNumero: (m.nf_numero as string | null) ?? null,
      nfSerie: (m.nf_serie as string | null) ?? null,
      nfDataEmissao: (m.nf_data_emissao as string | null) ?? null,
      cfop: (m.cfop as number | null) ?? null,
      naturezaOperacao: (m.natureza_operacao as string | null) ?? null,
      contraparteNome: (m.contraparte_nome as string | null) ?? null,
      contraparteCnpj: (m.contraparte_cnpj as string | null) ?? null,
      valorTotalItem: m.valor_total_item === null ? null : Number(m.valor_total_item),
      custoCompra: m.custo_compra === null ? null : Number(m.custo_compra),
      localDepois: (m.local_depois as string | null) ?? null,
      vendaDeConsignacao: (m.venda_de_consignacao as boolean | null) ?? null,
      removido: Boolean(m.removido),
    })),
  };
}
