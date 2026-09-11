SET XACT_ABORT ON;
BEGIN TRANSACTION;

/*
 * NF de saída: toda movimentação de saída (empréstimo, consignação,
 * baixa por venda) também precisa de uma nota fiscal, e o mesmo ERP tem
 * um endpoint próprio pra ela (diferente do de entrada). URLs
 * configuráveis do mesmo jeito que já existe pra NF de entrada.
 */
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.com_estoque_equipamentos_usados_config') AND name = 'url_nf_saida'
)
BEGIN
  ALTER TABLE dbo.com_estoque_equipamentos_usados_config ADD url_nf_saida NVARCHAR(600) NULL;
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.com_estoque_equipamentos_usados_config') AND name = 'url_nf_saida_teste'
)
BEGIN
  ALTER TABLE dbo.com_estoque_equipamentos_usados_config ADD url_nf_saida_teste NVARCHAR(600) NULL;
END;

/*
 * Valor da movimentação de saída — vem da consulta da NF de saída no
 * ERP (campo "valorTotal"), mas fica editável também (nem toda
 * movimentação necessariamente passa pela integração).
 */
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.com_estoque_equipamentos_usados_movimentacoes') AND name = 'valor'
)
BEGIN
  ALTER TABLE dbo.com_estoque_equipamentos_usados_movimentacoes ADD valor DECIMAL(12, 2) NULL;
END;

COMMIT TRANSACTION;
GO

/*
 * A mesma tabela de tentativas de integração (antes só pra NF de
 * entrada) passa a registrar também as consultas de NF de saída — o
 * "tipo_nf" distingue o que cada linha representa: NF de entrada, ou
 * saída por empréstimo/consignação/venda.
 */
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.com_estoque_integracao_nf_logs') AND name = 'tipo_nf'
)
BEGIN
  ALTER TABLE dbo.com_estoque_integracao_nf_logs
    ADD tipo_nf VARCHAR(20) NOT NULL CONSTRAINT DF_com_estoque_nf_logs_tipo_nf DEFAULT 'entrada';
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_com_estoque_nf_logs_tipo_nf')
BEGIN
  ALTER TABLE dbo.com_estoque_integracao_nf_logs
    ADD CONSTRAINT CK_com_estoque_nf_logs_tipo_nf CHECK (
      [tipo_nf] IN (N'entrada', N'saida_emprestimo', N'saida_consignacao', N'saida_venda')
    );
END;
