SET XACT_ABORT ON;
BEGIN TRANSACTION;

/*
 * 'aguardando_pareamento' tem 21 caracteres — VARCHAR(20) original
 * truncava e quebrava o INSERT. Erro descoberto em teste ao vivo.
 */
IF EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.portal_tv_terminais') AND name = 'status'
    AND max_length < 30
)
BEGIN
  ALTER TABLE dbo.portal_tv_terminais
    ALTER COLUMN [status] VARCHAR(30) NOT NULL;
END;

COMMIT TRANSACTION;
