SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.portal_tv_config') AND name = 'url_agente'
)
BEGIN
  ALTER TABLE dbo.portal_tv_config
    ADD [url_agente] NVARCHAR(300) NULL;
END;

COMMIT TRANSACTION;
