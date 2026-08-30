SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.portal_tv_terminais') AND name = 'agente_ultima_verificacao_em'
)
BEGIN
  ALTER TABLE dbo.portal_tv_terminais
    ADD [agente_ultima_verificacao_em] DATETIME2 NULL;
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.portal_tv_terminais') AND name = 'agente_hash_atual'
)
BEGIN
  ALTER TABLE dbo.portal_tv_terminais
    ADD [agente_hash_atual] VARCHAR(64) NULL;
END;

COMMIT TRANSACTION;
