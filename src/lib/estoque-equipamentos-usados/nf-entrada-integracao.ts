import "server-only";

import { ValidationError } from "@/lib/auth/errors";
import { getSqlServerPool, sql } from "@/lib/database/sql-server";
import { registrarLog } from "@/lib/monitoramento/logs";
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
  descricao: string;
  status: StatusEquipamento;
  codigoEmpresa: string;
  codigoCliente: string;
  valorMascara: string;
  numeroNfEntradaAtual: string | null;
}

/*
 * Só entram aqui equipamentos com os 3 parâmetros da consulta já
 * disponíveis (empresa, cliente com código e o campo mapeado como
 * "mascara" preenchidos) — sem isso não dá pra montar uma chamada válida
 * ao ERP, então nem conta como tentativa. O filtro de "pendente" não é
 * mais "sem NF de entrada" — desde que a NF passou a poder ser digitada
 * na entrada, um equipamento pode já ter um número (o que a pessoa
 * digitou) e mesmo assim continuar pendente de confirmação pela
 * integração (ver nf_entrada_confirmada_em).
 */
export async function listarEquipamentosPendentesNf(): Promise<EquipamentoPendenteNf[]> {
  const config = await buscarConfigErpEstoqueUsados();
  const { selectExpr, exigirNaoVazio } = expressaoMascara(config.campoMascaraChave);

  const pool = await getSqlServerPool();

  const result = await pool.request().query<{
    id: string;
    numero: number;
    descricao: string;
    status: StatusEquipamento;
    codigo_empresa: string | null;
    codigo_cliente: string | null;
    valor_mascara: string | null;
    numero_nf_entrada: string | null;
  }>(`
    SELECT
      CONVERT(VARCHAR(36), [id]) AS [id],
      [numero],
      [descricao],
      [status],
      [codigo_empresa],
      [codigo_cliente],
      ${selectExpr} AS [valor_mascara],
      [numero_nf_entrada]
    FROM dbo.com_estoque_equipamentos_usados
    WHERE [nf_entrada_confirmada_em] IS NULL
      AND [codigo_empresa] IS NOT NULL AND [codigo_empresa] <> ''
      AND [codigo_cliente] IS NOT NULL AND [codigo_cliente] <> ''
      ${exigirNaoVazio ? `AND ${selectExpr} IS NOT NULL AND ${selectExpr} <> ''` : ""};
  `);

  return result.recordset.map((row) => ({
    id: row.id,
    numero: row.numero,
    descricao: row.descricao,
    status: row.status,
    codigoEmpresa: row.codigo_empresa as string,
    codigoCliente: row.codigo_cliente as string,
    valorMascara: row.valor_mascara as string,
    numeroNfEntradaAtual: row.numero_nf_entrada,
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
      descricao: string;
      status: StatusEquipamento;
      numero_nf_entrada: string | null;
      nf_entrada_confirmada_em: string | null;
      codigo_empresa: string | null;
      codigo_cliente: string | null;
      valor_mascara: string | null;
    }>(`
      SELECT
        CONVERT(VARCHAR(36), [id]) AS [id],
        [numero],
        [descricao],
        [status],
        [numero_nf_entrada],
        CONVERT(VARCHAR(33), [nf_entrada_confirmada_em], 126) AS [nf_entrada_confirmada_em],
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

  if (row.nf_entrada_confirmada_em) {
    throw new ValidationError("Este equipamento já teve a NF de entrada confirmada pela integração com o ERP.");
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
    descricao: row.descricao,
    status: row.status,
    codigoEmpresa: row.codigo_empresa,
    codigoCliente: row.codigo_cliente,
    valorMascara: row.valor_mascara,
    numeroNfEntradaAtual: row.numero_nf_entrada,
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
        [nf_entrada_confirmada_em] = SYSDATETIME(),
        [atualizado_em] = SYSDATETIME()
      WHERE [id] = @id;
    `);
}

/*
 * A NF de entrada agora pode ter sido digitada por alguém na entrada —
 * quando a integração confirma um número diferente desse, o ERP vence
 * (é a fonte de verdade), mas a troca precisa ficar visível pra quem
 * olhar depois: entra no mesmo "Histórico de alterações" das edições
 * manuais de dados técnicos (dbo.portal_logs, origem
 * "estoque-equipamentos-usados/dados"), com o autor identificado como a
 * integração (ou quem clicou "Tentar agora").
 */
async function registrarDivergenciaNfEntrada(params: {
  equipamentoId: string;
  numero: number;
  descricao: string;
  numeroAnterior: string;
  numeroNovo: string;
  disparadoPor: string | null;
}): Promise<void> {
  const autor = params.disparadoPor ?? "Integração automática (ERP)";

  await registrarLog({
    nivel: "aviso",
    origem: "estoque-equipamentos-usados/dados",
    mensagem: `${autor} atualizou o número da NF de entrada do equipamento #${params.numero} (${params.descricao}) — divergência encontrada pela integração com o ERP.`,
    detalhes: JSON.stringify({
      equipamentoId: params.equipamentoId,
      numero: params.numero,
      descricao: params.descricao,
      alteracoes: [
        {
          campo: "numeroNfEntrada",
          rotulo: "NF de entrada",
          de: params.numeroAnterior,
          para: params.numeroNovo,
        },
      ],
      motivo:
        "Divergência encontrada pela integração automática do ERP — o número informado manualmente na entrada era diferente do localizado no ERP.",
    }),
  });
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
        mensagem: detalhes.mensagemNaoEncontrado || "NF ainda não localizada no ERP.",
        parametrosConsulta,
        disparadoPor,
        requestUrl: detalhes.requestUrl,
        responseStatus: detalhes.responseStatus,
        responseBody: detalhes.responseBody,
      });
      return;
    }

    const numeroAnterior = equipamento.numeroNfEntradaAtual;
    const divergiu = Boolean(numeroAnterior) && numeroAnterior !== resultado.numeroNf;

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

    if (divergiu && numeroAnterior) {
      await registrarDivergenciaNfEntrada({
        equipamentoId: equipamento.id,
        numero: equipamento.numero,
        descricao: equipamento.descricao,
        numeroAnterior,
        numeroNovo: resultado.numeroNf,
        disparadoPor,
      });
    }

    await registrarTentativaNf({
      equipamentoId: equipamento.id,
      status: "sucesso",
      mensagem: divergiu
        ? `NF ${resultado.numeroNf} localizada — divergia do número informado na entrada (${numeroAnterior}), atualizado automaticamente.`
        : `NF ${resultado.numeroNf} localizada e aplicada ao equipamento.`,
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

export type TipoNfIntegracao = "entrada" | "saida_emprestimo" | "saida_consignacao" | "saida_venda";

export interface TentativaIntegracaoNf {
  id: string;
  tipoNf: TipoNfIntegracao;
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
  tipo_nf: TipoNfIntegracao;
  status: TentativaIntegracaoNf["status"];
  mensagem: string | null;
  parametros_consulta: string | null;
  disparado_por: string | null;
  iniciado_em: string;
  request_url: string | null;
  response_status: number | null;
  response_body: string | null;
}

export async function listarTentativasNf(
  equipamentoId: string,
  pagina = 1,
  porPagina = 15
): Promise<{ itens: TentativaIntegracaoNf[]; total: number }> {
  const pool = await getSqlServerPool();

  const offset = (pagina - 1) * porPagina;

  const [itensResult, totalResult] = await Promise.all([
    pool
      .request()
      .input("equipamentoId", sql.UniqueIdentifier, equipamentoId)
      .input("offset", sql.Int, offset)
      .input("porPagina", sql.Int, porPagina)
      .query<TentativaRow>(`
        SELECT
          CONVERT(VARCHAR(36), [id]) AS [id],
          [tipo_nf],
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
        ORDER BY [iniciado_em] DESC
        OFFSET @offset ROWS FETCH NEXT @porPagina ROWS ONLY;
      `),
    pool
      .request()
      .input("equipamentoId", sql.UniqueIdentifier, equipamentoId)
      .query<{ total: number }>(`
        SELECT COUNT(*) AS [total] FROM dbo.com_estoque_integracao_nf_logs
        WHERE [equipamento_id] = @equipamentoId;
      `),
  ]);

  return {
    itens: itensResult.recordset.map((row) => ({
      id: row.id,
      tipoNf: row.tipo_nf,
      status: row.status,
      mensagem: row.mensagem,
      parametrosConsulta: row.parametros_consulta,
      disparadoPor: row.disparado_por,
      iniciadoEm: row.iniciado_em,
      requestUrl: row.request_url,
      responseStatus: row.response_status,
      responseBody: row.response_body,
    })),
    total: totalResult.recordset[0]?.total ?? 0,
  };
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
