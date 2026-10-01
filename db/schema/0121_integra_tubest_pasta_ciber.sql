SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- Peças da Ciber têm numeração própria: o arquivo não está na pasta de
-- STEP pelo código do item, e sim pelo código do desenho, numa pasta
-- separada (a mesma que o Lantek já usa para os DXF da Ciber).
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.integra_tubest_config') AND name = 'pasta_step_ciber'
)
BEGIN
  ALTER TABLE dbo.integra_tubest_config ADD [pasta_step_ciber] NVARCHAR(300) NULL;
END;

COMMIT TRANSACTION;
