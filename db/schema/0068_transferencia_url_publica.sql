SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.portal_transferencia_config') AND name = 'url_publica'
)
BEGIN
  ALTER TABLE dbo.portal_transferencia_config ADD [url_publica] NVARCHAR(300) NULL;
END;

COMMIT TRANSACTION;
