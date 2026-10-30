import "server-only";

import { ValidationError } from "@/lib/auth/errors";
import { getSqlServerPool, sql } from "@/lib/database/sql-server";

/*
 * Troca o número de um equipamento (só administrador). O número é a
 * coluna IDENTITY da tabela -- não dá para dar UPDATE nela --, então a
 * troca é: copia o registro com o número novo (IDENTITY_INSERT), move
 * tudo o que pertence a ele (movimentações e anexos, evidências, cópia do
 * extrato do ERP, tentativas de integração e o histórico de alterações),
 * apaga o antigo. Tudo numa transação só: ou troca inteiro, ou nada.
 *
 * Opções:
 * - trocarNumeroSerie: o número de série acompanha (só quando ele é igual
 *   ao número antigo -- é o "número do carro").
 * - desfazerIntegracao: o número é a máscara que acha a NF no ERP; com o
 *   número errado, a integração pode ter puxado a NF e o extrato de OUTRO
 *   carro. Apaga o que ela criou, volta a NF digitada na entrada e deixa o
 *   equipamento pendente para a busca rodar de novo com o número novo.
 */

export interface ResultadoTrocaNumero {
  novoId: string;
  numeroAntigo: number;
  novoNumero: number;
}

export async function trocarNumeroEquipamento(params: {
  id: string;
  novoNumero: number;
  trocarNumeroSerie: boolean;
  desfazerIntegracao: boolean;
  motivo: string;
  usuarioNome: string;
}): Promise<ResultadoTrocaNumero> {
  const { id, novoNumero } = params;
  if (!Number.isInteger(novoNumero) || novoNumero <= 0) {
    throw new ValidationError("Informe um número inteiro maior que zero.");
  }

  const pool = await getSqlServerPool();
  const atual = await pool
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .query<{ numero: number; numero_serie: string | null; numero_nf_entrada: string | null; integrado: number }>(`
      SELECT [numero], [numero_serie], [numero_nf_entrada],
             CASE WHEN [nf_entrada_confirmada_em] IS NOT NULL OR [erp_id_item] IS NOT NULL THEN 1 ELSE 0 END AS [integrado]
      FROM dbo.com_estoque_equipamentos_usados WHERE [id] = @id;
    `);
  const equipamento = atual.recordset[0];
  if (!equipamento) throw new ValidationError("Equipamento não encontrado.");
  if (equipamento.numero === novoNumero) throw new ValidationError("O número novo é igual ao atual.");

  /*
   * NF que a pessoa digitou na entrada: se a integração trocou por outra
   * ("divergência encontrada"), o primeiro registro dessa troca guarda o
   * valor original em "de".
   */
  let nfDigitada: string | null = null;
  if (params.desfazerIntegracao) {
    const original = await pool
      .request()
      .input("id", sql.VarChar(36), id.toUpperCase())
      .query<{ de: string | null }>(`
        SELECT TOP 1 JSON_VALUE([detalhes], '$.alteracoes[0].de') AS [de]
        FROM dbo.portal_logs
        WHERE [origem] = 'estoque-equipamentos-usados/dados' AND ISJSON([detalhes]) = 1
          AND UPPER(JSON_VALUE([detalhes], '$.equipamentoId')) = @id
          AND JSON_VALUE([detalhes], '$.alteracoes[0].campo') = 'numeroNfEntrada'
          AND [mensagem] LIKE N'Integração automática%'
        ORDER BY [criado_em] ASC;
      `);
    nfDigitada = original.recordset[0]?.de?.trim() || null;
  }

  const serieAcompanha = params.trocarNumeroSerie && (equipamento.numero_serie ?? "").trim() === String(equipamento.numero);
  const alteracoes = [
    { campo: "numero", rotulo: "Número do equipamento", de: String(equipamento.numero), para: String(novoNumero) },
    ...(serieAcompanha
      ? [{ campo: "numeroSerie", rotulo: "Número de série", de: String(equipamento.numero), para: String(novoNumero) }]
      : []),
    ...(params.desfazerIntegracao && nfDigitada && nfDigitada !== equipamento.numero_nf_entrada
      ? [{ campo: "numeroNfEntrada", rotulo: "NF de entrada", de: equipamento.numero_nf_entrada ?? "", para: nfDigitada }]
      : []),
    ...(params.desfazerIntegracao && equipamento.integrado
      ? [{ campo: "integracaoErp", rotulo: "Integração com o ERP", de: "Confirmada", para: "Desfeita (será buscada de novo)" }]
      : []),
  ];
  const detalhes = JSON.stringify({
    equipamentoId: null,
    numero: novoNumero,
    alteracoes,
    motivo: params.motivo,
  });
  const mensagem = `${params.usuarioNome} trocou o número do equipamento #${equipamento.numero} para #${novoNumero}${
    params.desfazerIntegracao ? " e desfez a integração com o ERP" : ""
  }.`;

  try {
    const resultado = await pool
      .request()
      .input("antigo", sql.UniqueIdentifier, id)
      .input("numeroAntigo", sql.Int, equipamento.numero)
      .input("novoNumero", sql.Int, novoNumero)
      .input("trocarSerie", sql.Bit, serieAcompanha)
      .input("desfazer", sql.Bit, params.desfazerIntegracao)
      .input("nfDigitada", sql.NVarChar(30), nfDigitada)
      .input("mensagem", sql.NVarChar(2000), mensagem.slice(0, 2000))
      .input("detalhes", sql.NVarChar(sql.MAX), detalhes)
      .query<{ novo_id: string }>(`
        SET XACT_ABORT ON;
        DECLARE @novo UNIQUEIDENTIFIER = NEWID();
        DECLARE @msg NVARCHAR(200);

        BEGIN TRANSACTION;

        IF NOT EXISTS (SELECT 1 FROM dbo.com_estoque_equipamentos_usados WITH (UPDLOCK, HOLDLOCK) WHERE [id] = @antigo AND [numero] = @numeroAntigo)
          THROW 50001, N'O equipamento mudou enquanto a troca era preparada. Abra de novo e tente outra vez.', 1;
        IF EXISTS (SELECT 1 FROM dbo.com_estoque_equipamentos_usados WITH (UPDLOCK, HOLDLOCK) WHERE [numero] = @novoNumero)
        BEGIN
          SET @msg = CONCAT(N'Já existe um equipamento com o número ', @novoNumero, N'.');
          THROW 50002, @msg, 1;
        END;

        IF @desfazer = 1
        BEGIN
          DELETE FROM dbo.com_estoque_equipamentos_usados_movimentacoes
          WHERE [equipamento_id] = @antigo AND ([origem] = 'erp' OR [tipo_acao] = 'nf_vinculada');
          UPDATE dbo.com_estoque_equipamentos_usados_movimentacoes SET [erp_id_movimentacao] = NULL WHERE [equipamento_id] = @antigo;
          DELETE FROM dbo.com_estoque_equipamentos_usados_erp_movimentos WHERE [equipamento_id] = @antigo;
          DELETE FROM dbo.com_estoque_integracao_nf_logs WHERE [equipamento_id] = @antigo;
        END;

        DECLARE @colunas NVARCHAR(MAX) = (
          SELECT STRING_AGG(CAST(QUOTENAME([name]) AS NVARCHAR(MAX)), N', ') WITHIN GROUP (ORDER BY [column_id])
          FROM sys.columns
          WHERE [object_id] = OBJECT_ID(N'dbo.com_estoque_equipamentos_usados') AND [name] NOT IN ('id', 'numero')
        );
        DECLARE @copia NVARCHAR(MAX) = N'
          SET IDENTITY_INSERT dbo.com_estoque_equipamentos_usados ON;
          INSERT INTO dbo.com_estoque_equipamentos_usados ([id], [numero], ' + @colunas + N')
          SELECT @novo, @novoNumero, ' + @colunas + N' FROM dbo.com_estoque_equipamentos_usados WHERE [id] = @antigo;
          SET IDENTITY_INSERT dbo.com_estoque_equipamentos_usados OFF;';
        EXEC sp_executesql @copia, N'@novo UNIQUEIDENTIFIER, @antigo UNIQUEIDENTIFIER, @novoNumero INT',
          @novo = @novo, @antigo = @antigo, @novoNumero = @novoNumero;

        UPDATE dbo.com_estoque_equipamentos_usados_movimentacoes SET [equipamento_id] = @novo WHERE [equipamento_id] = @antigo;
        UPDATE dbo.com_estoque_equipamentos_usados_evidencias SET [equipamento_id] = @novo WHERE [equipamento_id] = @antigo;
        UPDATE dbo.com_estoque_equipamentos_usados_erp_movimentos SET [equipamento_id] = @novo WHERE [equipamento_id] = @antigo;
        UPDATE dbo.com_estoque_integracao_nf_logs SET [equipamento_id] = @novo WHERE [equipamento_id] = @antigo;
        /* Histórico de alterações é ligado pelo id dentro do JSON: acompanha o equipamento. */
        UPDATE dbo.portal_logs
        SET [detalhes] = JSON_MODIFY([detalhes], '$.equipamentoId', CONVERT(VARCHAR(36), @novo))
        WHERE [origem] = 'estoque-equipamentos-usados/dados' AND ISJSON([detalhes]) = 1
          AND UPPER(JSON_VALUE([detalhes], '$.equipamentoId')) = UPPER(CONVERT(VARCHAR(36), @antigo));

        DELETE FROM dbo.com_estoque_equipamentos_usados WHERE [id] = @antigo;

        UPDATE dbo.com_estoque_equipamentos_usados
        SET [numero_serie] = CASE WHEN @trocarSerie = 1 THEN CAST(@novoNumero AS NVARCHAR(100)) ELSE [numero_serie] END,
            [atualizado_em] = SYSDATETIME()
        WHERE [id] = @novo;

        IF @desfazer = 1
          UPDATE dbo.com_estoque_equipamentos_usados
          SET [numero_nf_entrada] = ISNULL(@nfDigitada, [numero_nf_entrada]),
              [status] = ISNULL((
                SELECT TOP 1 m.[status_resultante] FROM dbo.com_estoque_equipamentos_usados_movimentacoes m
                WHERE m.[equipamento_id] = @novo ORDER BY m.[data_acao] DESC, m.[criado_em] DESC
              ), 'em_estoque'),
              [erp_codigo_item] = NULL, [erp_id_item] = NULL, [erp_data_entrada] = NULL,
              [erp_validado_em] = NULL, [erp_validado_por] = NULL, [nf_entrada_confirmada_em] = NULL,
              [erp_local] = NULL, [erp_local_desde] = NULL, [erp_cod_emp_atual] = NULL, [erp_contraparte_atual] = NULL,
              [erp_custo_compra] = NULL, [erp_extrato_em] = NULL, [erp_extrato_erro] = NULL
          WHERE [id] = @novo;

        INSERT INTO dbo.portal_logs ([nivel], [origem], [mensagem], [detalhes])
        VALUES ('aviso', 'estoque-equipamentos-usados/dados', @mensagem,
                JSON_MODIFY(@detalhes, '$.equipamentoId', CONVERT(VARCHAR(36), @novo)));

        COMMIT TRANSACTION;
        SELECT CONVERT(VARCHAR(36), @novo) AS [novo_id];
      `);

    const novoId = resultado.recordset[0]?.novo_id;
    if (!novoId) throw new Error("A troca não devolveu o novo registro.");
    return { novoId, numeroAntigo: equipamento.numero, novoNumero };
  } catch (erro) {
    const numero = (erro as { number?: number; originalError?: { info?: { number?: number; message?: string } } }).number
      ?? (erro as { originalError?: { info?: { number?: number } } }).originalError?.info?.number;
    if (numero === 50001 || numero === 50002) {
      throw new ValidationError(erro instanceof Error ? erro.message : "Não foi possível trocar o número.");
    }
    throw erro;
  }
}
