SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- Rastro do relatório enviado pelo solicitante: sem isso, clicar duas
-- vezes manda dois e-mails com dado sensível e ninguém fica sabendo.
-- Guarda o último envio (quando, por quem, para onde).
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.portal_aprovacoes') AND name = 'relatorio_enviado_em'
)
BEGIN
  ALTER TABLE dbo.portal_aprovacoes ADD [relatorio_enviado_em] DATETIME2 NULL;
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.portal_aprovacoes') AND name = 'relatorio_enviado_por'
)
BEGIN
  ALTER TABLE dbo.portal_aprovacoes ADD [relatorio_enviado_por] NVARCHAR(200) NULL;
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.portal_aprovacoes') AND name = 'relatorio_enviado_para'
)
BEGIN
  ALTER TABLE dbo.portal_aprovacoes ADD [relatorio_enviado_para] NVARCHAR(200) NULL;
END;

COMMIT TRANSACTION;
