SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.portal_tv_terminais') AND name = 'visualizacao_solicitada_em'
)
BEGIN
  ALTER TABLE dbo.portal_tv_terminais
    ADD [visualizacao_solicitada_em] DATETIME2 NULL;
END;

COMMIT TRANSACTION;
