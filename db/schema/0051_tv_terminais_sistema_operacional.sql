SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.portal_tv_terminais') AND name = 'agente_sistema_operacional'
)
BEGIN
  ALTER TABLE dbo.portal_tv_terminais
    ADD [agente_sistema_operacional] VARCHAR(20) NULL;
END;

COMMIT TRANSACTION;
