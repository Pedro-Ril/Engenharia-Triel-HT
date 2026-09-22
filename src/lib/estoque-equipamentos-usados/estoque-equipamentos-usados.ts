import "server-only";

import type { Request as SqlRequest } from "mssql";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";
import { ValidationError } from "@/lib/auth/errors";
import type { PortalUsuario } from "@/lib/auth/usuarios";
import { COLUNA_EQUIPAMENTO_POR_CHAVE_SISTEMA, listarCamposComPendencia } from "./tipos-equipamento";
import { buscarEmpresaPorCodigo } from "@/lib/empresas/empresas";

export type StatusEquipamento = "em_estoque" | "emprestado" | "consignado" | "baixado";
export type TipoAcaoMovimentacao =
  | "entrada"
  | "emprestimo"
  | "consignacao"
  | "retorno"
  | "baixa"
  | "nf_vinculada";
export type MotivoBaixa = "venda" | "descarte" | "perda" | "outro";

export interface Equipamento {
  id: string;
  numero: number;
  tipoEquipamentoId: string | null;
  nomeCliente: string | null;
  codigoCliente: string | null;
  valor: number | null;
  descricao: string;
  marca: string | null;
  modelo: string | null;
  numeroSerie: string | null;
  codigoEmpresa: string | null;
  erpCodigoItem: string | null;
  erpIdItem: string | null;
  erpDataEntrada: string | null;
  erpValidadoEm: string | null;
  erpValidadoPor: string | null;
  status: StatusEquipamento;
  numeroNfEntrada: string | null;
  observacoes: string | null;
  camposValores: Record<string, unknown> | null;
  criadoPorNome: string;
  criadoEm: string;
  atualizadoEm: string;
}

export interface MovimentacaoEquipamento {
  id: string;
  equipamentoId: string;
  tipoAcao: TipoAcaoMovimentacao;
  numeroNf: string | null;
  destinatarioNome: string | null;
  motivoBaixa: MotivoBaixa | null;
  valor: number | null;
  dataEmissaoNf: string | null;
  statusResultante: StatusEquipamento;
  observacoes: string | null;
  dataAcao: string;
  criadoPorNome: string;
  criadoEm: string;
}

export interface EquipamentoComEstrato extends Equipamento {
  movimentacoes: MovimentacaoEquipamento[];
}

const colunasEquipamento = `
  CONVERT(VARCHAR(36), [id]) AS [id],
  [numero],
  CONVERT(VARCHAR(36), [tipo_equipamento_id]) AS [tipo_equipamento_id],
  [nome_cliente],
  [codigo_cliente],
  [valor],
  [descricao],
  [marca],
  [modelo],
  [numero_serie],
  [codigo_empresa],
  [erp_codigo_item],
  [erp_id_item],
  CONVERT(VARCHAR(10), [erp_data_entrada], 23) AS [erp_data_entrada],
  CONVERT(VARCHAR(33), [erp_validado_em], 126) AS [erp_validado_em],
  [erp_validado_por],
  [status],
  [numero_nf_entrada],
  [observacoes],
  [campos_valores],
  [criado_por_nome],
  CONVERT(VARCHAR(33), [criado_em], 126) AS [criado_em],
  CONVERT(VARCHAR(33), [atualizado_em], 126) AS [atualizado_em]
`;

interface EquipamentoRow {
  id: string;
  numero: number;
  tipo_equipamento_id: string | null;
  nome_cliente: string | null;
  codigo_cliente: string | null;
  valor: number | null;
  descricao: string;
  marca: string | null;
  modelo: string | null;
  numero_serie: string | null;
  codigo_empresa: string | null;
  erp_codigo_item: string | null;
  erp_id_item: string | null;
  erp_data_entrada: string | null;
  erp_validado_em: string | null;
  erp_validado_por: string | null;
  status: StatusEquipamento;
  numero_nf_entrada: string | null;
  observacoes: string | null;
  campos_valores: string | null;
  criado_por_nome: string;
  criado_em: string;
  atualizado_em: string;
}

function mapEquipamentoRow(row: EquipamentoRow): Equipamento {
  return {
    id: row.id,
    numero: row.numero,
    tipoEquipamentoId: row.tipo_equipamento_id,
    nomeCliente: row.nome_cliente,
    codigoCliente: row.codigo_cliente,
    valor: row.valor,
    descricao: row.descricao,
    marca: row.marca,
    modelo: row.modelo,
    numeroSerie: row.numero_serie,
    codigoEmpresa: row.codigo_empresa,
    erpCodigoItem: row.erp_codigo_item,
    erpIdItem: row.erp_id_item,
    erpDataEntrada: row.erp_data_entrada,
    erpValidadoEm: row.erp_validado_em,
    erpValidadoPor: row.erp_validado_por,
    status: row.status,
    numeroNfEntrada: row.numero_nf_entrada,
    observacoes: row.observacoes,
    camposValores: row.campos_valores
      ? (JSON.parse(row.campos_valores) as Record<string, unknown>)
      : null,
    criadoPorNome: row.criado_por_nome,
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em,
  };
}

interface MovimentacaoRow {
  id: string;
  equipamento_id: string;
  tipo_acao: TipoAcaoMovimentacao;
  numero_nf: string | null;
  destinatario_nome: string | null;
  motivo_baixa: MotivoBaixa | null;
  valor: number | null;
  data_emissao_nf: string | null;
  status_resultante: StatusEquipamento;
  observacoes: string | null;
  data_acao: string;
  criado_por_nome: string;
  criado_em: string;
}

function mapMovimentacaoRow(row: MovimentacaoRow): MovimentacaoEquipamento {
  return {
    id: row.id,
    equipamentoId: row.equipamento_id,
    tipoAcao: row.tipo_acao,
    numeroNf: row.numero_nf,
    destinatarioNome: row.destinatario_nome,
    motivoBaixa: row.motivo_baixa,
    valor: row.valor,
    dataEmissaoNf: row.data_emissao_nf,
    statusResultante: row.status_resultante,
    observacoes: row.observacoes,
    dataAcao: row.data_acao,
    criadoPorNome: row.criado_por_nome,
    criadoEm: row.criado_em,
  };
}

export interface CriarEquipamentoParams {
  tipoEquipamentoId: string;
  nomeCliente: string | null;
  codigoCliente: string | null;
  valor: number | null;
  descricao: string;
  marca: string | null;
  modelo: string | null;
  numeroSerie: string | null;
  codigoEmpresa: string | null;
  erpCodigoItem: string | null;
  erpIdItem: string | null;
  erpDataEntrada: string | null;
  erpValidadoEm: string | null;
  erpValidadoPor: string | null;
  numeroNfEntrada: string | null;
  observacoes: string | null;
  camposValoresJson: string | null;
  dataAcao: string;
  criadoPorUsuarioId: string;
  criadoPorNome: string;
}

/*
 * Cria o equipamento e já registra a primeira linha do estrato
 * (tipo_acao='entrada') na mesma transação — a entrada é, ela mesma,
 * uma movimentação, não um evento separado.
 */
export async function criarEquipamento(params: CriarEquipamentoParams): Promise<Equipamento> {
  const pool = await getSqlServerPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const resultadoInsert = await new sql.Request(transaction)
      .input("tipoEquipamentoId", sql.UniqueIdentifier, params.tipoEquipamentoId)
      .input("nomeCliente", sql.NVarChar(200), params.nomeCliente)
      .input("codigoCliente", sql.NVarChar(30), params.codigoCliente)
      .input("valor", sql.Decimal(12, 2), params.valor)
      .input("descricao", sql.NVarChar(300), params.descricao)
      .input("marca", sql.NVarChar(100), params.marca)
      .input("modelo", sql.NVarChar(100), params.modelo)
      .input("numeroSerie", sql.NVarChar(100), params.numeroSerie)
      .input("codigoEmpresa", sql.NVarChar(20), params.codigoEmpresa)
      .input("erpCodigoItem", sql.NVarChar(50), params.erpCodigoItem)
      .input("erpIdItem", sql.NVarChar(50), params.erpIdItem)
      .input("erpDataEntrada", sql.Date, params.erpDataEntrada)
      .input("erpValidadoEm", sql.DateTime2, params.erpValidadoEm)
      .input("erpValidadoPor", sql.NVarChar(150), params.erpValidadoPor)
      .input("numeroNfEntrada", sql.NVarChar(30), params.numeroNfEntrada)
      .input("observacoes", sql.NVarChar(1000), params.observacoes)
      .input("camposValores", sql.NVarChar(sql.MAX), params.camposValoresJson)
      .input("criadoPorUsuarioId", sql.UniqueIdentifier, params.criadoPorUsuarioId)
      .input("criadoPorNome", sql.NVarChar(150), params.criadoPorNome)
      .query(`
        INSERT INTO dbo.com_estoque_equipamentos_usados
          ([tipo_equipamento_id], [nome_cliente], [codigo_cliente], [valor], [descricao], [marca], [modelo], [numero_serie], [codigo_empresa],
           [erp_codigo_item], [erp_id_item], [erp_data_entrada], [erp_validado_em], [erp_validado_por],
           [numero_nf_entrada], [observacoes], [campos_valores], [criado_por_usuario_id], [criado_por_nome])
        OUTPUT CONVERT(VARCHAR(36), INSERTED.[id]) AS [id]
        VALUES
          (@tipoEquipamentoId, @nomeCliente, @codigoCliente, @valor, @descricao, @marca, @modelo, @numeroSerie, @codigoEmpresa,
           @erpCodigoItem, @erpIdItem, @erpDataEntrada, @erpValidadoEm, @erpValidadoPor,
           @numeroNfEntrada, @observacoes, @camposValores, @criadoPorUsuarioId, @criadoPorNome);
      `);

    const equipamentoId = resultadoInsert.recordset[0].id as string;

    await new sql.Request(transaction)
      .input("equipamentoId", sql.UniqueIdentifier, equipamentoId)
      .input("numeroNf", sql.NVarChar(30), params.numeroNfEntrada)
      .input("dataAcao", sql.Date, params.dataAcao)
      .input("criadoPorUsuarioId", sql.UniqueIdentifier, params.criadoPorUsuarioId)
      .input("criadoPorNome", sql.NVarChar(150), params.criadoPorNome)
      .query(`
        INSERT INTO dbo.com_estoque_equipamentos_usados_movimentacoes
          ([equipamento_id], [tipo_acao], [numero_nf], [status_resultante], [data_acao],
           [criado_por_usuario_id], [criado_por_nome])
        VALUES
          (@equipamentoId, 'entrada', @numeroNf, 'em_estoque', @dataAcao,
           @criadoPorUsuarioId, @criadoPorNome);
      `);

    await transaction.commit();

    const criado = await buscarEquipamentoPorId(equipamentoId);
    if (!criado) {
      throw new Error("Equipamento criado mas não encontrado logo em seguida.");
    }
    return criado;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function buscarEquipamentoPorId(id: string): Promise<EquipamentoComEstrato | null> {
  const pool = await getSqlServerPool();

  const [equipamentoResult, movimentacoesResult] = await Promise.all([
    pool
      .request()
      .input("id", sql.UniqueIdentifier, id)
      .query<EquipamentoRow>(`
        SELECT ${colunasEquipamento}
        FROM dbo.com_estoque_equipamentos_usados
        WHERE [id] = @id;
      `),
    pool
      .request()
      .input("id", sql.UniqueIdentifier, id)
      .query<MovimentacaoRow>(`
        SELECT
          CONVERT(VARCHAR(36), [id]) AS [id],
          CONVERT(VARCHAR(36), [equipamento_id]) AS [equipamento_id],
          [tipo_acao],
          [numero_nf],
          [destinatario_nome],
          [motivo_baixa],
          [valor],
          CONVERT(VARCHAR(10), [data_emissao_nf], 23) AS [data_emissao_nf],
          [status_resultante],
          [observacoes],
          CONVERT(VARCHAR(10), [data_acao], 23) AS [data_acao],
          [criado_por_nome],
          CONVERT(VARCHAR(33), [criado_em], 126) AS [criado_em]
        FROM dbo.com_estoque_equipamentos_usados_movimentacoes
        WHERE [equipamento_id] = @id
        ORDER BY [data_acao] ASC, [criado_em] ASC;
      `),
  ]);

  const equipamentoRow = equipamentoResult.recordset[0];
  if (!equipamentoRow) {
    return null;
  }

  return {
    ...mapEquipamentoRow(equipamentoRow),
    movimentacoes: movimentacoesResult.recordset.map(mapMovimentacaoRow),
  };
}

/*
 * Exclusão definitiva é ação só de administrador (mesmo padrão de
 * excluirTransferencia em src/lib/transferencia/transferencias.ts) — o
 * ciclo de vida normal de um equipamento termina em "baixa", não em
 * apagar o registro; exclusão é pra corrigir um cadastro errado, não
 * uma operação do dia a dia. CASCADE em movimentações e evidências (e,
 * a partir delas, anexos de movimentação) já limpa tudo numa DELETE só.
 */
export async function excluirEquipamento(
  id: string,
  usuario: Pick<PortalUsuario, "ehAdministrador">
): Promise<Equipamento | null> {
  if (!usuario.ehAdministrador) {
    throw new ValidationError("Apenas administradores podem excluir equipamentos.");
  }

  const equipamento = await buscarEquipamentoPorId(id);
  if (!equipamento) return null;

  const pool = await getSqlServerPool();
  await pool
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .query(`DELETE FROM dbo.com_estoque_equipamentos_usados WHERE [id] = @id;`);

  return equipamento;
}

/*
 * Duplicação completa é ação só de administrador, mesmo padrão de
 * excluirEquipamento — cópia de tudo (linha principal, evidências,
 * movimentações + anexos de movimentação, tentativas de integração de
 * NF e histórico de alterações de dados técnicos em portal_logs), com
 * um "numero" escolhido à mão em vez do próximo da sequência. "numero"
 * é IDENTITY(1,1): SET IDENTITY_INSERT libera um INSERT explícito só
 * pra essa linha (ON/OFF sempre dentro do try/finally logo em volta do
 * único INSERT que precisa disso — é uma configuração da conexão, não
 * transacional, e new sql.Request(transaction) fica preso à mesma
 * conexão da transação inteira, então isso é seguro contanto que o OFF
 * sempre rode antes do commit). Depois do commit, reancora o IDENTITY
 * reaproveitando definirUltimoNumeroGerado, pra nenhum cadastro normal
 * futuro colidir com o número escolhido aqui.
 *
 * com_estoque_movimentacoes_anexos referencia [movimentacao_id], não
 * [equipamento_id] — por isso movimentações são copiadas uma a uma
 * (loop), capturando o novo id de cada uma via OUTPUT antes de copiar
 * seus anexos; as demais tabelas-filhas aceitam um INSERT...SELECT em
 * bloco só trocando [equipamento_id].
 *
 * "histórico de alterações de dados" não é uma tabela própria — é um
 * recorte de portal_logs (ver listarHistoricoAlteracoesDados) — cada
 * linha correspondente é reinserida com [equipamentoId]/[numero]
 * reescritos dentro do JSON de [detalhes] e a referência "#<numero>"
 * trocada dentro de [mensagem], preservando o [criado_em] original
 * (é histórico de verdade, não um evento de agora).
 */
export async function duplicarEquipamento(
  id: string,
  novoNumero: number,
  usuario: Pick<PortalUsuario, "id" | "nomeExibicao" | "ehAdministrador">
): Promise<Equipamento> {
  if (!usuario.ehAdministrador) {
    throw new ValidationError("Apenas administradores podem duplicar equipamentos.");
  }

  if (!Number.isInteger(novoNumero) || novoNumero <= 0) {
    throw new ValidationError("Informe um número inteiro válido para o novo equipamento.");
  }

  const original = await buscarEquipamentoPorId(id);
  if (!original) {
    throw new ValidationError("Equipamento não encontrado.");
  }

  const pool = await getSqlServerPool();

  const existenteResult = await pool
    .request()
    .input("numero", sql.Int, novoNumero)
    .query<{ total: number }>(
      `SELECT COUNT(*) AS [total] FROM dbo.com_estoque_equipamentos_usados WHERE [numero] = @numero;`
    );

  if ((existenteResult.recordset[0]?.total ?? 0) > 0) {
    throw new ValidationError(`Já existe um equipamento com o número ${novoNumero}.`);
  }

  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  let novoEquipamentoId: string | null = null;

  try {
    /*
     * SET IDENTITY_INSERT, o INSERT e o SET ... OFF precisam estar no
     * MESMO batch (uma única chamada .query()) — em requests separados
     * (mesmo presos à mesma transação/conexão via new sql.Request(transaction))
     * o driver mssql não garante que o ON de um request ainda valha no
     * INSERT do próximo, e o SQL Server recusa o INSERT explícito
     * ("...when IDENTITY_INSERT is set to OFF"), confirmado ao vivo.
     */
    const novoEquipamentoResult = await new sql.Request(transaction)
      .input("idOriginal", sql.UniqueIdentifier, id)
      .input("novoNumero", sql.Int, novoNumero)
      .input("criadoPorUsuarioId", sql.UniqueIdentifier, usuario.id)
      .input("criadoPorNome", sql.NVarChar(150), usuario.nomeExibicao)
      .query<{ id: string }>(`
        SET IDENTITY_INSERT dbo.com_estoque_equipamentos_usados ON;

        INSERT INTO dbo.com_estoque_equipamentos_usados
          ([id], [numero], [descricao], [marca], [modelo], [numero_serie], [codigo_empresa],
           [erp_codigo_item], [erp_id_item], [erp_data_entrada], [erp_validado_em], [erp_validado_por],
           [status], [numero_nf_entrada], [observacoes], [criado_por_usuario_id], [criado_por_nome],
           [criado_em], [atualizado_em], [tipo_equipamento_id], [nome_cliente], [valor], [campos_valores],
           [codigo_cliente], [nf_entrada_confirmada_em])
        OUTPUT CONVERT(VARCHAR(36), INSERTED.[id]) AS [id]
        SELECT
          NEWID(), @novoNumero, [descricao], [marca], [modelo], [numero_serie], [codigo_empresa],
          [erp_codigo_item], [erp_id_item], [erp_data_entrada], [erp_validado_em], [erp_validado_por],
          [status], [numero_nf_entrada], [observacoes], @criadoPorUsuarioId, @criadoPorNome,
          SYSDATETIME(), SYSDATETIME(), [tipo_equipamento_id], [nome_cliente], [valor], [campos_valores],
          [codigo_cliente], [nf_entrada_confirmada_em]
        FROM dbo.com_estoque_equipamentos_usados
        WHERE [id] = @idOriginal;

        SET IDENTITY_INSERT dbo.com_estoque_equipamentos_usados OFF;
      `);

    novoEquipamentoId = novoEquipamentoResult.recordset[0]?.id ?? null;

    if (!novoEquipamentoId) {
      throw new Error("Equipamento original não encontrado durante a duplicação.");
    }

    await new sql.Request(transaction)
      .input("idOriginal", sql.UniqueIdentifier, id)
      .input("novoEquipamentoId", sql.UniqueIdentifier, novoEquipamentoId)
      .query(`
        INSERT INTO dbo.com_estoque_equipamentos_usados_evidencias
          ([id], [equipamento_id], [nome_arquivo], [tipo_mime], [tamanho_bytes], [conteudo],
           [criado_por_usuario_id], [criado_por_nome], [criado_em], [bloco_id])
        SELECT NEWID(), @novoEquipamentoId, [nome_arquivo], [tipo_mime], [tamanho_bytes], [conteudo],
               [criado_por_usuario_id], [criado_por_nome], [criado_em], [bloco_id]
        FROM dbo.com_estoque_equipamentos_usados_evidencias
        WHERE [equipamento_id] = @idOriginal;
      `);

    await new sql.Request(transaction)
      .input("idOriginal", sql.UniqueIdentifier, id)
      .input("novoEquipamentoId", sql.UniqueIdentifier, novoEquipamentoId)
      .query(`
        INSERT INTO dbo.com_estoque_integracao_nf_logs
          ([id], [equipamento_id], [iniciado_em], [finalizado_em], [status], [mensagem],
           [parametros_consulta], [disparado_por], [request_url], [response_status], [response_body], [tipo_nf])
        SELECT NEWID(), @novoEquipamentoId, [iniciado_em], [finalizado_em], [status], [mensagem],
               [parametros_consulta], [disparado_por], [request_url], [response_status], [response_body], [tipo_nf]
        FROM dbo.com_estoque_integracao_nf_logs
        WHERE [equipamento_id] = @idOriginal;
      `);

    const movimentacoesOriginais = await new sql.Request(transaction)
      .input("idOriginal", sql.UniqueIdentifier, id)
      .query<{ id: string }>(`
        SELECT CONVERT(VARCHAR(36), [id]) AS [id]
        FROM dbo.com_estoque_equipamentos_usados_movimentacoes
        WHERE [equipamento_id] = @idOriginal
        ORDER BY [data_acao] ASC, [criado_em] ASC;
      `);

    for (const { id: movimentacaoOriginalId } of movimentacoesOriginais.recordset) {
      const novaMovResult = await new sql.Request(transaction)
        .input("movimentacaoOriginalId", sql.UniqueIdentifier, movimentacaoOriginalId)
        .input("novoEquipamentoId", sql.UniqueIdentifier, novoEquipamentoId)
        .query<{ id: string }>(`
          INSERT INTO dbo.com_estoque_equipamentos_usados_movimentacoes
            ([id], [equipamento_id], [tipo_acao], [numero_nf], [destinatario_nome], [motivo_baixa],
             [status_resultante], [observacoes], [data_acao], [criado_por_usuario_id], [criado_por_nome],
             [criado_em], [valor], [data_emissao_nf])
          OUTPUT CONVERT(VARCHAR(36), INSERTED.[id]) AS [id]
          SELECT NEWID(), @novoEquipamentoId, [tipo_acao], [numero_nf], [destinatario_nome], [motivo_baixa],
                 [status_resultante], [observacoes], [data_acao], [criado_por_usuario_id], [criado_por_nome],
                 [criado_em], [valor], [data_emissao_nf]
          FROM dbo.com_estoque_equipamentos_usados_movimentacoes
          WHERE [id] = @movimentacaoOriginalId;
        `);

      const novaMovimentacaoId = novaMovResult.recordset[0].id;

      await new sql.Request(transaction)
        .input("movimentacaoOriginalId", sql.UniqueIdentifier, movimentacaoOriginalId)
        .input("novaMovimentacaoId", sql.UniqueIdentifier, novaMovimentacaoId)
        .query(`
          INSERT INTO dbo.com_estoque_movimentacoes_anexos
            ([id], [movimentacao_id], [nome_arquivo], [tipo_mime], [tamanho_bytes], [conteudo],
             [criado_por_usuario_id], [criado_por_nome], [criado_em])
          SELECT NEWID(), @novaMovimentacaoId, [nome_arquivo], [tipo_mime], [tamanho_bytes], [conteudo],
                 [criado_por_usuario_id], [criado_por_nome], [criado_em]
          FROM dbo.com_estoque_movimentacoes_anexos
          WHERE [movimentacao_id] = @movimentacaoOriginalId;
        `);
    }

    const logsOriginais = await new sql.Request(transaction)
      .input("origem", sql.NVarChar(200), "estoque-equipamentos-usados/dados")
      .input("idOriginal", sql.UniqueIdentifier, id)
      .query<{
        nivel: string;
        mensagem: string;
        detalhes: string | null;
        metodo: string | null;
        caminho: string | null;
        ip_origem: string | null;
        criado_em: string;
      }>(`
        SELECT [nivel], [mensagem], [detalhes], [metodo], [caminho], [ip_origem],
          CONVERT(VARCHAR(33), [criado_em], 126) AS [criado_em]
        FROM dbo.portal_logs
        WHERE [origem] = @origem
          AND JSON_VALUE([detalhes], '$.equipamentoId') = @idOriginal;
      `);

    for (const log of logsOriginais.recordset) {
      const mensagemAtualizada = log.mensagem.split(`#${original.numero}`).join(`#${novoNumero}`);

      let detalhesAtualizados = log.detalhes;
      if (log.detalhes) {
        try {
          const detalhes = JSON.parse(log.detalhes) as Record<string, unknown>;
          detalhes.equipamentoId = novoEquipamentoId;
          detalhes.numero = novoNumero;
          detalhesAtualizados = JSON.stringify(detalhes);
        } catch {
          detalhesAtualizados = log.detalhes;
        }
      }

      await new sql.Request(transaction)
        .input("nivel", sql.VarChar(10), log.nivel)
        .input("origem", sql.NVarChar(200), "estoque-equipamentos-usados/dados")
        .input("mensagem", sql.NVarChar(2000), mensagemAtualizada.slice(0, 2000))
        .input("detalhes", sql.NVarChar(sql.MAX), detalhesAtualizados)
        .input("metodo", sql.VarChar(10), log.metodo)
        .input("caminho", sql.NVarChar(500), log.caminho)
        .input("ipOrigem", sql.VarChar(64), log.ip_origem)
        .input("criadoEm", sql.DateTime2, log.criado_em)
        .query(`
          INSERT INTO dbo.portal_logs
            ([nivel], [origem], [mensagem], [detalhes], [metodo], [caminho], [ip_origem], [criado_em])
          VALUES
            (@nivel, @origem, @mensagem, @detalhes, @metodo, @caminho, @ipOrigem, @criadoEm);
        `);
    }

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  const maxResult = await pool
    .request()
    .query<{ maximo: number | null }>(
      `SELECT MAX([numero]) AS [maximo] FROM dbo.com_estoque_equipamentos_usados;`
    );
  await definirUltimoNumeroGerado(maxResult.recordset[0]?.maximo ?? novoNumero);

  const duplicado = await buscarEquipamentoPorId(novoEquipamentoId);
  if (!duplicado) {
    throw new Error("Equipamento duplicado mas não encontrado logo em seguida.");
  }
  return duplicado;
}

export interface FiltrosEquipamentos {
  status?: StatusEquipamento;
  busca?: string;
  codigoEmpresa?: string;
  pendenciaChave?: string;
  pagina: number;
  porPagina: number;
}

export async function listarEquipamentos(
  filtros: FiltrosEquipamentos
): Promise<{ itens: Equipamento[]; total: number }> {
  const pool = await getSqlServerPool();

  function montarFiltros(request: SqlRequest): string {
    const condicoes: string[] = [];

    if (filtros.status) {
      request.input("status", sql.VarChar(20), filtros.status);
      condicoes.push("[status] = @status");
    }

    if (filtros.busca) {
      request.input("busca", sql.NVarChar(300), `%${filtros.busca}%`);
      condicoes.push(
        `(
          [descricao] LIKE @busca
          OR [numero_serie] LIKE @busca
          OR [erp_codigo_item] LIKE @busca
          OR [nome_cliente] LIKE @busca
          OR [codigo_cliente] LIKE @busca
          OR CAST([numero] AS NVARCHAR(10)) LIKE @busca
        )`
      );
    }

    if (filtros.codigoEmpresa) {
      request.input("codigoEmpresa", sql.NVarChar(20), filtros.codigoEmpresa);
      condicoes.push("[codigo_empresa] = @codigoEmpresa");
    }

    if (filtros.pendenciaChave) {
      const coluna = COLUNA_EQUIPAMENTO_POR_CHAVE_SISTEMA[filtros.pendenciaChave];
      if (coluna === "valor") {
        condicoes.push("[valor] IS NULL");
      } else if (coluna) {
        condicoes.push(`([${coluna}] IS NULL OR [${coluna}] = '')`);
      }
    }

    return condicoes.length > 0 ? `WHERE ${condicoes.join(" AND ")}` : "";
  }

  const requestItens = pool.request();
  const whereClause = montarFiltros(requestItens);

  const offset = (filtros.pagina - 1) * filtros.porPagina;
  requestItens.input("offset", sql.Int, offset);
  requestItens.input("porPagina", sql.Int, filtros.porPagina);

  const requestTotal = pool.request();
  montarFiltros(requestTotal);

  const [itensResult, totalResult] = await Promise.all([
    requestItens.query<EquipamentoRow>(`
      SELECT ${colunasEquipamento}
      FROM dbo.com_estoque_equipamentos_usados
      ${whereClause}
      ORDER BY [criado_em] DESC
      OFFSET @offset ROWS FETCH NEXT @porPagina ROWS ONLY;
    `),
    requestTotal.query<{ total: number }>(
      `SELECT COUNT(*) AS [total] FROM dbo.com_estoque_equipamentos_usados ${whereClause};`
    ),
  ]);

  return {
    itens: itensResult.recordset.map(mapEquipamentoRow),
    total: totalResult.recordset[0]?.total ?? 0,
  };
}

interface RegistrarMovimentacaoParams {
  equipamentoId: string;
  tipoAcao: TipoAcaoMovimentacao;
  numeroNf: string;
  destinatarioNome: string | null;
  motivoBaixa: MotivoBaixa | null;
  valor: number | null;
  dataEmissaoNf: string | null;
  observacoes: string | null;
  dataAcao: string;
  criadoPorUsuarioId: string;
  criadoPorNome: string;
}

const STATUS_PERMITIDO_PARA_ACAO: Record<
  Exclude<TipoAcaoMovimentacao, "entrada" | "nf_vinculada">,
  { statusExigidos: StatusEquipamento[]; novoStatus: StatusEquipamento }
> = {
  emprestimo: { statusExigidos: ["em_estoque"], novoStatus: "emprestado" },
  consignacao: { statusExigidos: ["em_estoque"], novoStatus: "consignado" },
  retorno: { statusExigidos: ["emprestado", "consignado"], novoStatus: "em_estoque" },
  baixa: { statusExigidos: ["em_estoque"], novoStatus: "baixado" },
};

const LABEL_STATUS: Record<StatusEquipamento, string> = {
  em_estoque: "em estoque",
  emprestado: "emprestado",
  consignado: "em consignação",
  baixado: "baixado",
};

async function registrarMovimentacao(
  params: RegistrarMovimentacaoParams
): Promise<EquipamentoComEstrato> {
  const regra = STATUS_PERMITIDO_PARA_ACAO[params.tipoAcao as Exclude<TipoAcaoMovimentacao, "entrada" | "nf_vinculada">];

  const pool = await getSqlServerPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const statusAtualResult = await new sql.Request(transaction)
      .input("id", sql.UniqueIdentifier, params.equipamentoId)
      .query<{
        status: StatusEquipamento;
        numero_nf_entrada: string | null;
        erp_codigo_item: string | null;
        erp_id_item: string | null;
        erp_data_entrada: string | null;
        tipo_equipamento_id: string | null;
        codigo_empresa: string | null;
      }>(`
        SELECT [status], [numero_nf_entrada], [erp_codigo_item], [erp_id_item],
          CONVERT(VARCHAR(10), [erp_data_entrada], 23) AS [erp_data_entrada],
          [codigo_empresa],
          CONVERT(VARCHAR(36), [tipo_equipamento_id]) AS [tipo_equipamento_id]
        FROM dbo.com_estoque_equipamentos_usados WITH (UPDLOCK, ROWLOCK)
        WHERE [id] = @id;
      `);

    const linhaAtual = statusAtualResult.recordset[0];

    if (!linhaAtual) {
      throw new ValidationError("Equipamento não encontrado.");
    }

    const statusAtual = linhaAtual.status;

    if (!regra.statusExigidos.includes(statusAtual)) {
      throw new ValidationError(
        `Esta ação não é permitida — o equipamento está ${LABEL_STATUS[statusAtual]}.`
      );
    }

    /*
     * Empréstimo/consignação só podem sair do estoque com a NF de
     * entrada já CONFIRMADA pela integração com o ERP (código do item,
     * ID configurado e data de entrada todos preenchidos) — só ter o
     * número digitado não basta, senão o equipamento pode circular pra
     * fora sem o lastro documental real ter sido validado ainda.
     */
    if (
      (params.tipoAcao === "emprestimo" || params.tipoAcao === "consignacao") &&
      (!linhaAtual.numero_nf_entrada ||
        !linhaAtual.erp_codigo_item ||
        !linhaAtual.erp_id_item ||
        !linhaAtual.erp_data_entrada)
    ) {
      throw new ValidationError(
        `Não é possível registrar ${params.tipoAcao === "emprestimo" ? "o empréstimo" : "a consignação"} — a NF de entrada deste equipamento ainda não foi confirmada pela integração com o ERP.`
      );
    }

    /*
     * Qualquer campo de sistema marcado como "vira status" (pendência) E
     * "trava movimentações" (ver TiposEquipamentoPainel) bloqueia
     * QUALQUER movimentação (empréstimo, consignação, retorno ou baixa)
     * enquanto estiver vazio nesse equipamento — configurável por
     * admin, ao contrário da regra fixa de NF de entrada acima.
     */
    if (linhaAtual.tipo_equipamento_id) {
      const camposPendencia = await listarCamposComPendencia();
      const pendenciasBloqueantes = camposPendencia.filter(
        (campo) => campo.travaMovimentacao && campo.tipoEquipamentoId === linhaAtual.tipo_equipamento_id
      );

      if (pendenciasBloqueantes.length > 0) {
        const colunas = pendenciasBloqueantes
          .map((campo) => COLUNA_EQUIPAMENTO_POR_CHAVE_SISTEMA[campo.chave])
          .filter((coluna): coluna is string => Boolean(coluna));

        if (colunas.length > 0) {
          const colunasSql = colunas.map((coluna) => `[${coluna}]`).join(", ");
          const resultPendencias = await new sql.Request(transaction)
            .input("id", sql.UniqueIdentifier, params.equipamentoId)
            .query<Record<string, unknown>>(`
              SELECT ${colunasSql} FROM dbo.com_estoque_equipamentos_usados WHERE [id] = @id;
            `);

          const linhaPendencias = resultPendencias.recordset[0] ?? {};

          for (const campo of pendenciasBloqueantes) {
            const coluna = COLUNA_EQUIPAMENTO_POR_CHAVE_SISTEMA[campo.chave];
            if (!coluna) continue;

            const valor = linhaPendencias[coluna];
            const vazio = valor === null || valor === undefined || valor === "";

            if (vazio) {
              throw new ValidationError(
                `Não é possível registrar esta ação — o equipamento tem uma pendência que trava movimentações: "${campo.rotulo}".`
              );
            }
          }
        }
      }
    }

    /*
     * "Retorno ao estoque" não tem um destinatário externo — quem
     * recebe de volta é a própria empresa do cadastro do equipamento,
     * então o destinatário dessa movimentação é sempre ela, resolvida
     * pelo código já gravado, nunca digitada por quem clica em
     * "Confirmar".
     */
    const destinatarioNomeFinal =
      params.tipoAcao === "retorno"
        ? linhaAtual.codigo_empresa
          ? (await buscarEmpresaPorCodigo(linhaAtual.codigo_empresa))?.nome ?? null
          : null
        : params.destinatarioNome;

    await new sql.Request(transaction)
      .input("id", sql.UniqueIdentifier, params.equipamentoId)
      .input("status", sql.VarChar(20), regra.novoStatus)
      .query(`
        UPDATE dbo.com_estoque_equipamentos_usados
        SET [status] = @status, [atualizado_em] = SYSDATETIME()
        WHERE [id] = @id;
      `);

    await new sql.Request(transaction)
      .input("equipamentoId", sql.UniqueIdentifier, params.equipamentoId)
      .input("tipoAcao", sql.VarChar(20), params.tipoAcao)
      .input("numeroNf", sql.NVarChar(30), params.numeroNf)
      .input("destinatarioNome", sql.NVarChar(200), destinatarioNomeFinal)
      .input("motivoBaixa", sql.VarChar(20), params.motivoBaixa)
      .input("valor", sql.Decimal(12, 2), params.valor)
      .input("dataEmissaoNf", sql.Date, params.dataEmissaoNf)
      .input("statusResultante", sql.VarChar(20), regra.novoStatus)
      .input("observacoes", sql.NVarChar(1000), params.observacoes)
      .input("dataAcao", sql.Date, params.dataAcao)
      .input("criadoPorUsuarioId", sql.UniqueIdentifier, params.criadoPorUsuarioId)
      .input("criadoPorNome", sql.NVarChar(150), params.criadoPorNome)
      .query(`
        INSERT INTO dbo.com_estoque_equipamentos_usados_movimentacoes
          ([equipamento_id], [tipo_acao], [numero_nf], [destinatario_nome], [motivo_baixa], [valor], [data_emissao_nf],
           [status_resultante], [observacoes], [data_acao], [criado_por_usuario_id], [criado_por_nome])
        VALUES
          (@equipamentoId, @tipoAcao, @numeroNf, @destinatarioNome, @motivoBaixa, @valor, @dataEmissaoNf,
           @statusResultante, @observacoes, @dataAcao, @criadoPorUsuarioId, @criadoPorNome);
      `);

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  const atualizado = await buscarEquipamentoPorId(params.equipamentoId);
  if (!atualizado) {
    throw new Error("Equipamento atualizado mas não encontrado logo em seguida.");
  }
  return atualizado;
}

export interface AcaoMovimentacaoParams {
  equipamentoId: string;
  numeroNf: string;
  destinatarioNome: string | null;
  valor: number | null;
  dataEmissaoNf: string | null;
  observacoes: string | null;
  dataAcao: string;
  criadoPorUsuarioId: string;
  criadoPorNome: string;
}

export function registrarEmprestimo(
  params: AcaoMovimentacaoParams
): Promise<EquipamentoComEstrato> {
  return registrarMovimentacao({ ...params, tipoAcao: "emprestimo", motivoBaixa: null });
}

export function registrarConsignacao(
  params: AcaoMovimentacaoParams
): Promise<EquipamentoComEstrato> {
  return registrarMovimentacao({ ...params, tipoAcao: "consignacao", motivoBaixa: null });
}

/*
 * Não recebe destinatário nem valor/data de emissão — registrarMovimentacao
 * resolve sozinho o nome da empresa do cadastro pra essa ação (ver
 * comentário lá dentro); retorno não tem uma NF de saída própria.
 */
export function registrarRetorno(
  params: Omit<AcaoMovimentacaoParams, "destinatarioNome" | "valor" | "dataEmissaoNf">
): Promise<EquipamentoComEstrato> {
  return registrarMovimentacao({
    ...params,
    destinatarioNome: null,
    valor: null,
    dataEmissaoNf: null,
    tipoAcao: "retorno",
    motivoBaixa: null,
  });
}

export interface RegistrarBaixaParams extends AcaoMovimentacaoParams {
  motivoBaixa: MotivoBaixa;
}

export function registrarBaixa(params: RegistrarBaixaParams): Promise<EquipamentoComEstrato> {
  return registrarMovimentacao({ ...params, tipoAcao: "baixa" });
}

/*
 * Registra no extrato o momento em que a NF de entrada foi vinculada ao
 * equipamento (job automático ou botão "Tentar agora") — não muda o
 * status, só deixa visível no histórico completo quando isso aconteceu.
 * criadoPorUsuarioId fica null pro job automático (sem usuário logado
 * por trás); a distinção manual/automático já fica no próprio nome.
 */
export async function registrarMovimentacaoNfVinculada(params: {
  equipamentoId: string;
  numeroNf: string;
  statusAtual: StatusEquipamento;
  criadoPorNome: string;
}): Promise<void> {
  const pool = await getSqlServerPool();

  await pool
    .request()
    .input("equipamentoId", sql.UniqueIdentifier, params.equipamentoId)
    .input("numeroNf", sql.NVarChar(30), params.numeroNf)
    .input("statusResultante", sql.VarChar(20), params.statusAtual)
    .input("criadoPorNome", sql.NVarChar(150), params.criadoPorNome)
    .query(`
      INSERT INTO dbo.com_estoque_equipamentos_usados_movimentacoes
        ([equipamento_id], [tipo_acao], [numero_nf], [status_resultante], [data_acao], [criado_por_usuario_id], [criado_por_nome])
      VALUES
        (@equipamentoId, 'nf_vinculada', @numeroNf, @statusResultante, CAST(SYSUTCDATETIME() AS DATE), NULL, @criadoPorNome);
    `);
}

export async function atualizarValidacaoErp(
  equipamentoId: string,
  dados: { erpCodigoItem: string; erpIdItem: string; erpDataEntrada: string; validadoPor: string }
): Promise<void> {
  const pool = await getSqlServerPool();

  await pool
    .request()
    .input("id", sql.UniqueIdentifier, equipamentoId)
    .input("erpCodigoItem", sql.NVarChar(50), dados.erpCodigoItem)
    .input("erpIdItem", sql.NVarChar(50), dados.erpIdItem)
    .input("erpDataEntrada", sql.Date, dados.erpDataEntrada)
    .input("validadoPor", sql.NVarChar(150), dados.validadoPor)
    .query(`
      UPDATE dbo.com_estoque_equipamentos_usados
      SET
        [erp_codigo_item] = @erpCodigoItem,
        [erp_id_item] = @erpIdItem,
        [erp_data_entrada] = @erpDataEntrada,
        [erp_validado_em] = SYSDATETIME(),
        [erp_validado_por] = @validadoPor,
        [atualizado_em] = SYSDATETIME()
      WHERE [id] = @id;
    `);
}

/*
 * "Editar dados técnicos" — completa/corrige nome do cliente, valor e os
 * valores dos campos dinâmicos depois da entrada (o tipo de equipamento em
 * si não é editável: trocar de tipo invalidaria os valores já gravados).
 * camposValoresJson substitui o JSON inteiro (o formulário de edição
 * sempre reenvia o conjunto completo já mesclado com o que existia).
 */
export async function atualizarDadosEquipamento(
  equipamentoId: string,
  dados: {
    nomeCliente: string | null;
    codigoCliente: string | null;
    valor: number | null;
    camposValoresJson: string | null;
  }
): Promise<void> {
  const pool = await getSqlServerPool();

  await pool
    .request()
    .input("id", sql.UniqueIdentifier, equipamentoId)
    .input("nomeCliente", sql.NVarChar(200), dados.nomeCliente)
    .input("codigoCliente", sql.NVarChar(30), dados.codigoCliente)
    .input("valor", sql.Decimal(12, 2), dados.valor)
    .input("camposValores", sql.NVarChar(sql.MAX), dados.camposValoresJson)
    .query(`
      UPDATE dbo.com_estoque_equipamentos_usados
      SET
        [nome_cliente] = @nomeCliente,
        [codigo_cliente] = @codigoCliente,
        [valor] = @valor,
        [campos_valores] = @camposValores,
        [atualizado_em] = SYSDATETIME()
      WHERE [id] = @id;
    `);
}

/*
 * "numero" é IDENTITY(1,1) — IDENT_CURRENT devolve o último valor já
 * gerado (mesmo que a linha tenha sido excluída depois), que é
 * exatamente "o próximo vai ser esse + 1" que o admin precisa ver.
 */
export async function obterUltimoNumeroGerado(): Promise<number> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<{ valor: number | null }>(
    `SELECT IDENT_CURRENT('dbo.com_estoque_equipamentos_usados') AS [valor];`
  );

  return result.recordset[0]?.valor ?? 0;
}

/*
 * Reseeda o IDENTITY — recusa um valor menor que o maior "numero" já
 * gravado numa linha viva, senão o próximo gerado colidiria com um
 * equipamento existente (numero tem UNIQUE) na primeira entrada nova.
 */
export async function definirUltimoNumeroGerado(novoValor: number): Promise<void> {
  if (!Number.isInteger(novoValor) || novoValor < 0) {
    throw new ValidationError("Informe um número inteiro válido (0 ou maior).");
  }

  const pool = await getSqlServerPool();

  const maxResult = await pool
    .request()
    .query<{ maximo: number | null }>(`SELECT MAX([numero]) AS [maximo] FROM dbo.com_estoque_equipamentos_usados;`);

  const maximoAtual = maxResult.recordset[0]?.maximo ?? 0;

  if (novoValor < maximoAtual) {
    throw new ValidationError(
      `Já existe um equipamento com número ${maximoAtual} — defina um valor igual ou maior, senão o próximo cadastro pode gerar um número duplicado.`
    );
  }

  await pool
    .request()
    .input("novoValor", sql.Int, novoValor)
    .query(`DBCC CHECKIDENT ('dbo.com_estoque_equipamentos_usados', RESEED, @novoValor);`);
}

export interface AlteracaoDadosTecnicosHistorico {
  campo: string;
  rotulo: string;
  de: unknown;
  para: unknown;
}

export interface HistoricoAlteracaoDadosTecnicos {
  id: string;
  alteracoes: AlteracaoDadosTecnicosHistorico[];
  autorNome: string;
  criadoEm: string;
  motivo: string | null;
}

interface HistoricoLogRow {
  id: string;
  mensagem: string;
  detalhes: string | null;
  criado_em: Date;
}

/*
 * Reaproveita dbo.portal_logs (já usado por Administração → Monitoramento
 * → Logs) em vez de criar uma tabela de auditoria dedicada — a origem
 * "estoque-equipamentos-usados/dados" identifica o tipo de evento, e o
 * equipamentoId dentro de "detalhes" (JSON) filtra pra um equipamento
 * específico via JSON_VALUE, sem precisar de coluna própria.
 */
export async function listarHistoricoAlteracoesDados(
  equipamentoId: string
): Promise<HistoricoAlteracaoDadosTecnicos[]> {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("origem", sql.NVarChar(200), "estoque-equipamentos-usados/dados")
    .input("equipamentoId", sql.UniqueIdentifier, equipamentoId).query<HistoricoLogRow>(`
      SELECT [id], [mensagem], [detalhes], [criado_em]
      FROM dbo.portal_logs
      WHERE [origem] = @origem
        AND JSON_VALUE([detalhes], '$.equipamentoId') = @equipamentoId
      ORDER BY [criado_em] DESC;
    `);

  return result.recordset.map((row) => {
    let alteracoes: AlteracaoDadosTecnicosHistorico[] = [];
    let motivo: string | null = null;
    let autorNome = row.mensagem.split(" ")[0] ?? "Usuário";

    if (row.detalhes) {
      try {
        const detalhes = JSON.parse(row.detalhes) as {
          alteracoes?: AlteracaoDadosTecnicosHistorico[];
          motivo?: string;
        };
        alteracoes = detalhes.alteracoes ?? [];
        motivo = detalhes.motivo ?? null;
      } catch {
        alteracoes = [];
      }
    }

    const autorMatch = row.mensagem.match(/^(.*?) atualizou/);
    if (autorMatch) autorNome = autorMatch[1];

    return {
      id: row.id,
      alteracoes,
      autorNome,
      criadoEm: row.criado_em.toISOString(),
      motivo,
    };
  });
}
