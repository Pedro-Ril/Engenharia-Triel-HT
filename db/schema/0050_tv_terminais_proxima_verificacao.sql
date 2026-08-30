SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.portal_tv_terminais') AND name = 'agente_proxima_verificacao_em'
)
BEGIN
  ALTER TABLE dbo.portal_tv_terminais
    ADD [agente_proxima_verificacao_em] DATETIME2 NULL;
END;

COMMIT TRANSACTION;
