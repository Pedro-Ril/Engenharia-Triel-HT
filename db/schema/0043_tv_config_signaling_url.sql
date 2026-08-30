SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.portal_tv_config') AND name = 'signaling_url'
)
BEGIN
  ALTER TABLE dbo.portal_tv_config
    ADD [signaling_url] NVARCHAR(300) NULL;
END;

COMMIT TRANSACTION;
