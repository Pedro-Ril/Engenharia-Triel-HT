SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.eng_estrutura_substituicao_historico')
    AND name = 'payload_enviado'
)
BEGIN
  ALTER TABLE dbo.eng_estrutura_substituicao_historico
    ADD payload_enviado NVARCHAR(MAX) NULL;
END;

COMMIT TRANSACTION;
