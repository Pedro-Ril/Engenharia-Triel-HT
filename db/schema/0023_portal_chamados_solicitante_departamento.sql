SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.portal_chamados') AND name = 'solicitante_departamento'
)
BEGIN
  ALTER TABLE dbo.portal_chamados ADD [solicitante_departamento] NVARCHAR(200) NULL;
END;

COMMIT TRANSACTION;
