import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";
import { consultarNfSaidaNoErp, listarClientesErp, type DetalhesChamadaNfErp } from "./erp-integracao";
import type { TipoNfIntegracao } from "./nf-entrada-integracao";

/*
 * NF de saída não tem job automático (diferente da de entrada) — é
 * consultada sob demanda, quando o usuário digita/sai do campo "Número
 * da NF" num dos modais de empréstimo, consignação ou baixa por venda.
 * Reaproveita a mesma tabela de tentativas da NF de entrada
 * (com_estoque_integracao_nf_logs), só que com tipo_nf identificando
 * qual dos três é.
 */
async function registrarTentativaNfSaida(params: {
  equipamentoId: string;
  tipoNf: TipoNfIntegracao;
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
    .input("tipoNf", sql.VarChar(20), params.tipoNf)
    .input("status", sql.NVarChar(20), params.status)
    .input("mensagem", sql.NVarChar(500), params.mensagem)
    .input("parametrosConsulta", sql.NVarChar(300), params.parametrosConsulta)
    .input("disparadoPor", sql.NVarChar(150), params.disparadoPor)
    .input("requestUrl", sql.NVarChar(500), params.requestUrl ?? null)
    .input("responseStatus", sql.Int, params.responseStatus ?? null)
    .input("responseBody", sql.NVarChar(sql.MAX), params.responseBody ?? null)
    .query(`
      INSERT INTO dbo.com_estoque_integracao_nf_logs
        ([equipamento_id], [tipo_nf], [finalizado_em], [status], [mensagem], [parametros_consulta], [disparado_por], [request_url], [response_status], [response_body])
      VALUES
        (@equipamentoId, @tipoNf, SYSDATETIME(), @status, @mensagem, @parametrosConsulta, @disparadoPor, @requestUrl, @responseStatus, @responseBody);
    `);
}

export interface ResultadoBuscaNfSaida {
  encontrado: boolean;
  destinatarioNome: string | null;
  valor: number | null;
  dataEmissaoIso: string | null;
  mensagem: string;
}

interface ConsultaNfSaidaInterna {
  resultadoBusca: ResultadoBuscaNfSaida;
  status: "sucesso" | "nao_encontrado" | "erro";
  detalhes: DetalhesChamadaNfErp;
}

/*
 * Consulta o ERP e resolve o código do fornecedor pro nome do cliente
 * (mesma lista usada pelo autocomplete de Cliente) — nunca lança:
 * qualquer falha vira um resultado "não encontrado" com a mensagem de
 * erro, pra quem chama poder mostrar sem quebrar o preenchimento manual
 * do formulário. Não registra nada em "Tentativa de integração" — quem
 * chama decide se/quando isso deve virar um registro (ver
 * consultarNfSaidaSemRegistrar x tentarBuscarNfSaida logo abaixo).
 */
async function consultarNfSaidaInterno(params: {
  codigoEmpresa: string;
  numeroNf: string;
  idItem: string | null;
}): Promise<ConsultaNfSaidaInterna> {
  const detalhes: DetalhesChamadaNfErp = {};

  try {
    const resultado = await consultarNfSaidaNoErp(
      { codEmpresa: params.codigoEmpresa, numeroNf: params.numeroNf, idItem: params.idItem },
      detalhes
    );

    if (!resultado) {
      const mensagem = detalhes.mensagemNaoEncontrado || "Nenhuma NF de saída localizada para esses filtros.";
      return {
        status: "nao_encontrado",
        detalhes,
        resultadoBusca: { encontrado: false, destinatarioNome: null, valor: null, dataEmissaoIso: null, mensagem },
      };
    }

    let destinatarioNome: string | null = null;
    if (resultado.codigoFornecedor) {
      const clientes = await listarClientesErp();
      const codigoBuscado = resultado.codigoFornecedor.trim();
      const cliente = clientes.find((item) => String(item.cod_cli ?? "").trim() === codigoBuscado);
      destinatarioNome = cliente?.descricao ?? null;
    }

    const mensagem = destinatarioNome
      ? `NF ${params.numeroNf} localizada — destinatário "${destinatarioNome}", valor ${resultado.valorTotal}.`
      : `NF ${params.numeroNf} localizada — valor ${resultado.valorTotal} (fornecedor código ${resultado.codigoFornecedor} não encontrado na lista de clientes).`;

    return {
      status: "sucesso",
      detalhes,
      resultadoBusca: {
        encontrado: true,
        destinatarioNome,
        valor: resultado.valorTotal,
        dataEmissaoIso: resultado.dataEmissaoIso,
        mensagem,
      },
    };
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "Erro desconhecido ao consultar o ERP.";
    return {
      status: "erro",
      detalhes,
      resultadoBusca: { encontrado: false, destinatarioNome: null, valor: null, dataEmissaoIso: null, mensagem },
    };
  }
}

/*
 * Consulta "silenciosa" — usada só pra pré-preencher o formulário
 * enquanto o usuário ainda está digitando (ao sair do campo "Número da
 * NF"), sem registrar nada em "Tentativa de integração": se ele
 * abandonar sem confirmar a movimentação, essa consulta some sem deixar
 * rastro no histórico do equipamento — fica só no log genérico de
 * chamadas externas (Administração → Monitoramento), que já registra
 * toda chamada ao ERP independente de confirmação.
 */
export async function consultarNfSaidaSemRegistrar(params: {
  codigoEmpresa: string;
  numeroNf: string;
  idItem: string | null;
}): Promise<ResultadoBuscaNfSaida> {
  const { resultadoBusca } = await consultarNfSaidaInterno(params);
  return resultadoBusca;
}

/*
 * Mesma consulta, mas registra o resultado em "Tentativa de
 * integração" — chamada só no momento em que o usuário CONFIRMA a
 * movimentação (empréstimo/consignação/baixa por venda), nunca durante
 * a digitação; assim o histórico exibido pro usuário só mostra
 * consultas que realmente viraram uma movimentação de verdade.
 */
export async function tentarBuscarNfSaida(params: {
  equipamentoId: string;
  codigoEmpresa: string;
  numeroNf: string;
  idItem: string | null;
  tipoNf: TipoNfIntegracao;
  disparadoPor: string | null;
}): Promise<ResultadoBuscaNfSaida> {
  const parametrosConsulta = `empr_id=${params.codigoEmpresa}&num_nf=${params.numeroNf}${params.idItem ? `&id=${params.idItem}` : ""}`;
  const { resultadoBusca, status, detalhes } = await consultarNfSaidaInterno(params);

  await registrarTentativaNfSaida({
    equipamentoId: params.equipamentoId,
    tipoNf: params.tipoNf,
    status,
    mensagem: resultadoBusca.mensagem,
    parametrosConsulta,
    disparadoPor: params.disparadoPor,
    requestUrl: detalhes.requestUrl,
    responseStatus: detalhes.responseStatus,
    responseBody: detalhes.responseBody,
  });

  return resultadoBusca;
}
