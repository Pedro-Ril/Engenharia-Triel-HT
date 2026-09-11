SET XACT_ABORT ON;
BEGIN TRANSACTION;

/*
 * Data de emissão da NF de saída — vem da consulta ao ERP (campo
 * "dataEmissao", igual à "dataEntrada" do endpoint de entrada), mas
 * fica editável também (nem toda movimentação necessariamente passa
 * pela integração).
 */
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.com_estoque_equipamentos_usados_movimentacoes') AND name = 'data_emissao_nf'
)
BEGIN
  ALTER TABLE dbo.com_estoque_equipamentos_usados_movimentacoes ADD data_emissao_nf DATE NULL;
END;

COMMIT TRANSACTION;
