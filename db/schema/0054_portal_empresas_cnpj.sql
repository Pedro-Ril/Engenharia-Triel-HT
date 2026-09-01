SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.portal_empresas') AND name = 'cnpj'
)
BEGIN
  ALTER TABLE dbo.portal_empresas
    ADD [cnpj] VARCHAR(20) NULL;
END;

COMMIT TRANSACTION;
