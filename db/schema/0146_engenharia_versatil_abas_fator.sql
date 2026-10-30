/*
 * Engenharia Versátil: quais abas da planilha entram na conferência de
 * pesos e fator de conversão (uma por linha). Começa só com CHAPARIA.
 * Lista vazia = todas as abas fora da blacklist.
 */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.eng_versatil_config') AND name = 'abas_fator')
  ALTER TABLE dbo.eng_versatil_config ADD [abas_fator] NVARCHAR(2000) NULL;

COMMIT TRANSACTION;
GO

SET XACT_ABORT ON;
BEGIN TRANSACTION;

UPDATE dbo.eng_versatil_config SET [abas_fator] = N'CHAPARIA' WHERE [id] = 1 AND [abas_fator] IS NULL;

COMMIT TRANSACTION;
