/*
 * Histórico de configuração das alçadas: a descrição passa a trazer o
 * antes/depois das sugestões de direcionamento além dos níveis -- 1000
 * caracteres não bastam com várias regras.
 */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.portal_alcadas_historico') AND name = 'descricao' AND max_length = 2000
)
  ALTER TABLE dbo.portal_alcadas_historico ALTER COLUMN [descricao] NVARCHAR(4000) NOT NULL;

COMMIT TRANSACTION;
