SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.portal_usuarios') AND name = 'departamento'
)
BEGIN
  ALTER TABLE dbo.portal_usuarios ADD [departamento] NVARCHAR(200) NULL;
END;

COMMIT TRANSACTION;
