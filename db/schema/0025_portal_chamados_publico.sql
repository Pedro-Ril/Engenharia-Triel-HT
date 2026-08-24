SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.portal_chamados') AND name = 'publico'
)
BEGIN
  ALTER TABLE dbo.portal_chamados ADD [publico] BIT NOT NULL CONSTRAINT DF_portal_chamados_publico DEFAULT 0;
END;

COMMIT TRANSACTION;
