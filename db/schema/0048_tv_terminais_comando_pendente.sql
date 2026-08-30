SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.portal_tv_terminais') AND name = 'comando_pendente'
)
BEGIN
  ALTER TABLE dbo.portal_tv_terminais
    ADD [comando_pendente] VARCHAR(30) NULL;
END;

COMMIT TRANSACTION;
