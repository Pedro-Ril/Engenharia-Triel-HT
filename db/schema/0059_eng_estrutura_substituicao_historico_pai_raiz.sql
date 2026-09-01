SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.eng_estrutura_substituicao_historico')
    AND name = 'cod_pai_raiz'
)
BEGIN
  ALTER TABLE dbo.eng_estrutura_substituicao_historico
    ADD cod_pai_raiz NVARCHAR(60) NULL;
END;

COMMIT TRANSACTION;
