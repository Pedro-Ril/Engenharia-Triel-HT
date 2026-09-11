import "server-only";

import { ValidationError } from "@/lib/auth/errors";
import { getSqlServerPool, sql } from "@/lib/database/sql-server";
import {
  CHAVE_MASCARA_NUMERO_SEQUENCIAL,
  CHAVE_SISTEMA_MARCA,
  CHAVE_SISTEMA_MODELO,
  CHAVE_SISTEMA_NOME_CLIENTE,
  CHAVE_SISTEMA_NUMERO_SERIE,
} from "@/modules/estoque-equipamentos-usados/constants";
import {
  buscarConfigErpEstoqueUsados,
  consultarNfEntradaNoErp,
  type DetalhesChamadaNfErp,
} from "./erp-integracao";
import { registrarMovimentacaoNfVinculada, type StatusEquipamento } from "./estoque-equipamentos-usados";

/*
 * Traduz a chave configurada como "mascara" (de-para administrável, ver
 * OPCOES_CAMPO_MASCARA_NF) pra uma expressão SQL que devolve o valor como
 * texto — usado só aqui, pra montar a consulta de equipamentos pendentes.
 * O Nº sequencial (`numero`) é um caso especial: é INT e NOT NULL (não dá
 * pra comparar com '' como as colunas de texto), por isso tem sua própria
 * expressão e pula o filtro de "vazio".
 */
const COLUNA_POR_CHAVE_MASCARA: Record<string, string> = {
  [CHAVE_SISTEMA_NUMERO_SERIE]: "numero_serie",
  [CHAVE_SISTEMA_MARCA]: "marca",
  [CHAVE_SISTEMA_MODELO]: "modelo",
  [CHAVE_SISTEMA_NOME_CLIENTE]: "nome_cliente",
};

function expressaoMascara(chave: string): { selectExpr: string; exigirNaoVazio: boolean } {
  if (chave === CHAVE_MASCARA_NUMERO_SEQUENCIAL) {
    return { selectExpr: "CAST([numero] AS NVARCHAR(20))", exigirNaoVazio: false };
  }

  const coluna = COLUNA_POR_CHAVE_MASCARA[chave] ?? "numero_serie";
  return { selectExpr: `[${coluna}]`, exigirNaoVazio: true };
}

export interface EquipamentoPendenteNf {
  id: string;
  numero: number;
  status: StatusEquipamento;
  codigoEmpresa: string;
  codigoCliente: string;
  valorMascara: string;
}

/*
 * Só entram aqui equipamentos com os 3 parâmetros da consulta já
 * disponíveis (empresa, cliente com código e o campo mapeado como
 * "mascara" preenchidos) — sem isso não dá pra montar uma chamada válida
 * ao ERP, então nem conta como tentativa.
 */
export async function listarEquipamentosPendentesNf(): Promise<EquipamentoPendenteNf[]> {
  const config = await buscarConfigErpEstoqueUsados();
  const { selectExpr, exigirNaoVazio } = expressaoMascara(config.campoMascaraChave);

  const pool = await getSqlServerPool();

  const result = await pool.request().query<{
    id: string;
    numero: number;
    status: StatusEquipamento;
    codigo_empresa: string | null;
    codigo_cliente: string | null;
    valor_mascara: string | null;
  }>(`
    SELECT
      CONVERT(VARCHAR(36), [id]) AS [id],
      [numero],
      [status],
      [codigo_empresa],
      [codigo_cliente],
      ${selectExpr} AS [valor_mascara]
    FROM dbo.com_estoque_equipamentos_usados
    WHERE [numero_nf_entrada] IS NULL
      AND [codigo_empresa] IS NOT NULL AND [codigo_empresa] <> ''
      AND [codigo_cliente] IS NOT NULL AND [codigo_cliente] <> ''
      ${exigirNaoVazio ? `AND ${selectExpr} IS NOT NULL AND ${selectExpr} <> ''` : ""};
  `);

  return result.recordset.map((row) => ({
    id: row.id,
    numero: row.numero,
    status: row.status,
    codigoEmpresa: row.codigo_empresa as string,
    codigoCliente: row.codigo_cliente as string,
    valorMascara: row.valor_mascara as string,
  }));
}

/*
 * Mesma lógica de elegibilidade de listarEquipamentosPendentesNf, só que
 * pra um único equipamento — usada pelo botão "Tentar agora" (manual) na
 * tela do equipamento. Diferente do job automático, aqui a falta de um
 * parâmetro ou a NF já preenchida é um erro claro pra quem clicou, não um
 * item que simplesmente não entra na varredura.
 */
export async function buscarEquipamentoPendenteNfParaTentativa(
  equipamentoId: string
): Promise<EquipamentoPendenteNf> {
  const config = await buscarConfigErpEstoqueUsados();
  const { selectExpr } = expressaoMascara(config.campoMascaraChave);

  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("id", sql.UniqueIdentifier, equipamentoId)
    .query<{
      id: string;
      numero: number;
      status: StatusEquipamento;
      numero_nf_entrada: string | null;
      codigo_empresa: string | null;
      codigo_cliente: string | null;
      valor_mascara: string | null;
    }>(`
      SELECT
        CONVERT(VARCHAR(36), [id]) AS [id],
        [numero],
        [status],
        [numero_nf_entrada],
        [codigo_empresa],
        [codigo_cliente],
        ${selectExpr} AS [valor_mascara]
      FROM dbo.com_estoque_equipamentos_usados
      WHERE [id] = @id;
    `);

  const row = result.recordset[0];
  if (!row) {
    throw new ValidationError("Equipamento não encontrado.");
  }

  if (row.numero_nf_entrada) {
    throw new ValidationError("Este equipamento já tem NF de entrada preenchida.");
  }

  if (!row.codigo_empresa) {
    throw new ValidationError("Este equipamento não tem empresa preenchida — não é possível consultar o ERP.");
  }

  if (!row.codigo_cliente) {
    throw new ValidationError(
      "Este equipamento não tem cliente selecionado (com código) — reselecione o cliente pelo autocomplete."
    );
  }

  if (!row.valor_mascara) {
    throw new ValidationError(
      'O campo configurado como "mascara" (Administração → Integração ERP) está vazio neste equipamento.'
    );
  }

  return {
    id: row.id,
    numero: row.numero,
    status: row.status,
    codigoEmpresa: row.codigo_empresa,
    codigoCliente: row.codigo_cliente,
    valorMascara: row.valor_mascara,
  };
}

async function registrarTentativaNf(params: {
  equipamentoId: string;
  status: "sucesso" | "nao_encontrado" | "erro";
  mensagem: string | null;
  parametrosConsulta: string;
  disparadoPor: string | null;
  requestUrl?: string | null;
  responseStatus?: number | null;
  responseBody?: string | null;
}): Promise<void> {
  const pool = await getSqlServerPool();

  await pool
    .request()
    .input("equipamentoId", sql.UniqueIdentifier, params.equipamentoId)
    .input("status", sql.NVarChar(20), params.status)
    .input("mensagem", sql.NVarChar(500), params.mensagem)
    .input("parametrosConsulta", sql.NVarChar(300), params.parametrosConsulta)
    .input("disparadoPor", sql.NVarChar(150), params.disparadoPor)
    .input("requestUrl", sql.NVarChar(500), params.requestUrl ?? null)
    .input("responseStatus", sql.Int, params.responseStatus ?? null)
    .input("responseBody", sql.NVarChar(sql.MAX), params.responseBody ?? null)
    .query(`
      INSERT INTO dbo.com_estoque_integracao_nf_logs
        ([equipamento_id], [finalizado_em], [status], [mensagem], [parametros_consulta], [disparado_por], [request_url], [response_status], [response_body])
      VALUES
        (@equipamentoId, SYSDATETIME(), @status, @mensagem, @parametrosConsulta, @disparadoPor, @requestUrl, @responseStatus, @responseBody);
    `);
}

async function preencherNfEntradaDoEquipamento(
  equipamentoId: string,
  dados: { numeroNfEntrada: string; erpCodigoItem: string | null; erpIdItem: string | null; erpDataEntrada: string | null }
): Promise<void> {
  const pool = await getSqlServerPool();

  await pool
    .request()
    .input("id", sql.UniqueIdentifier, equipamentoId)
    .input("numeroNfEntrada", sql.NVarChar(30), dados.numeroNfEntrada)
    .input("erpCodigoItem", sql.NVarChar(50), dados.erpCodigoItem)
    .input("erpIdItem", sql.NVarChar(50), dados.erpIdItem)
    .input("erpDataEntrada", sql.Date, dados.erpDataEntrada)
    .query(`
      UPDATE dbo.com_estoque_equipamentos_usados
      SET
        [numero_nf_entrada] = @numeroNfEntrada,
        [erp_codigo_item] = COALESCE(NULLIF(@erpCodigoItem, ''), [erp_codigo_item]),
        [erp_id_item] = COALESCE(NULLIF(@erpIdItem, ''), [erp_id_item]),
        [erp_data_entrada] = COALESCE(@erpDataEntrada, [erp_data_entrada]),
        [atualizado_em] = SYSDATETIME()
      WHERE [id] = @id;
    `);
}

/*
 * Uma tentativa pra um único equipamento — chamada em loop pelo job
 * (nf-entrada-scheduler.ts) pra cada equipamento pendente. Nunca lança:
 * qualquer falha (ERP fora do ar, endpoint não configurado) vira uma
 * linha de log com status "erro" e o loop segue pro próximo equipamento.
 */
export async function tentarBuscarNfEntrada(
  equipamento: EquipamentoPendenteNf,
  disparadoPor: string | null
): Promise<void> {
  const parametrosConsulta = `cod_emp=${equipamento.codigoEmpresa}&mascara=${equipamento.valorMascara}&cod_for=${equipamento.codigoCliente}`;
  const detalhes: DetalhesChamadaNfErp = {};

  try {
    const resultado = await consultarNfEntradaNoErp(
      {
        codEmpresa: equipamento.codigoEmpresa,
        mascara: equipamento.valorMascara,
        codFornecedor: equipamento.codigoCliente,
      },
      detalhes
    );

    if (!resultado) {
      await registrarTentativaNf({
        equipamentoId: equipamento.id,
        status: "nao_encontrado",
        mensagem: "NF ainda não localizada no ERP.",
        parametrosConsulta,
        disparadoPor,
        requestUrl: detalhes.requestUrl,
        responseStatus: detalhes.responseStatus,
        responseBody: detalhes.responseBody,
      });
      return;
    }

    await preencherNfEntradaDoEquipamento(equipamento.id, {
      numeroNfEntrada: resultado.numeroNf,
      erpCodigoItem: resultado.codigoItem || null,
      erpIdItem: resultado.idConfigurado || null,
      erpDataEntrada: resultado.dataEntradaIso || null,
    });

    await registrarMovimentacaoNfVinculada({
      equipamentoId: equipamento.id,
      numeroNf: resultado.numeroNf,
      statusAtual: equipamento.status,
      criadoPorNome: disparadoPor ?? "Integração automática (ERP)",
    });

    await registrarTentativaNf({
      equipamentoId: equipamento.id,
      status: "sucesso",
      mensagem: `NF ${resultado.numeroNf} localizada e aplicada ao equipamento.`,
      parametrosConsulta,
      disparadoPor,
      requestUrl: detalhes.requestUrl,
      responseStatus: detalhes.responseStatus,
      responseBody: detalhes.responseBody,
    });
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "Erro desconhecido ao consultar o ERP.";

    await registrarTentativaNf({
      equipamentoId: equipamento.id,
      status: "erro",
      mensagem,
      parametrosConsulta,
      disparadoPor,
      requestUrl: detalhes.requestUrl,
      responseStatus: detalhes.responseStatus,
      responseBody: detalhes.responseBody,
    });
  }
}

export interface TentativaIntegracaoNf {
  id: string;
  status: "sucesso" | "nao_encontrado" | "erro";
  mensagem: string | null;
  parametrosConsulta: string | null;
  disparadoPor: string | null;
  iniciadoEm: string;
  requestUrl: string | null;
  responseStatus: number | null;
  responseBody: string | null;
}

interface TentativaRow {
  id: string;
  status: TentativaIntegracaoNf["status"];
  mensagem: string | null;
  parametros_consulta: string | null;
  disparado_por: string | null;
  iniciado_em: string;
  request_url: string | null;
  response_status: number | null;
  response_body: string | null;
}

export async function listarTentativasNf(equipamentoId: string): Promise<TentativaIntegracaoNf[]> {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("equipamentoId", sql.UniqueIdentifier, equipamentoId)
    .query<TentativaRow>(`
      SELECT TOP (200)
        CONVERT(VARCHAR(36), [id]) AS [id],
        [status],
        [mensagem],
        [parametros_consulta],
        [disparado_por],
        CONVERT(VARCHAR(33), [iniciado_em], 126) AS [iniciado_em],
        [request_url],
        [response_status],
        [response_body]
      FROM dbo.com_estoque_integracao_nf_logs
      WHERE [equipamento_id] = @equipamentoId
      ORDER BY [iniciado_em] DESC;
    `);

  return result.recordset.map((row) => ({
    id: row.id,
    status: row.status,
    mensagem: row.mensagem,
    parametrosConsulta: row.parametros_consulta,
    disparadoPor: row.disparado_por,
    iniciadoEm: row.iniciado_em,
    requestUrl: row.request_url,
    responseStatus: row.response_status,
    responseBody: row.response_body,
  }));
}

/*
 * Varre todos os equipamentos pendentes e tenta um a um, sequencialmente
 * (evita martelar o ERP com N chamadas em paralelo) — chamada pelo
 * agendador automático (disparadoPor null).
 */
export async function executarVarreduraNfEntrada(disparadoPor: string | null): Promise<number> {
  const pendentes = await listarEquipamentosPendentesNf();

  for (const equipamento of pendentes) {
    await tentarBuscarNfEntrada(equipamento, disparadoPor);
  }

  return pendentes.length;
}
