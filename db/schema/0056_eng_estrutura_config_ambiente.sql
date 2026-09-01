SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.eng_estrutura_config') AND name = 'url_consulta_estrutura_teste'
)
BEGIN
  ALTER TABLE dbo.eng_estrutura_config
    ADD [url_consulta_estrutura_teste] NVARCHAR(300) NULL;
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.eng_estrutura_config') AND name = 'url_validar_itens_teste'
)
BEGIN
  ALTER TABLE dbo.eng_estrutura_config
    ADD [url_validar_itens_teste] NVARCHAR(300) NULL;
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.eng_estrutura_config') AND name = 'url_atualizar_estrutura_teste'
)
BEGIN
  ALTER TABLE dbo.eng_estrutura_config
    ADD [url_atualizar_estrutura_teste] NVARCHAR(300) NULL;
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.eng_estrutura_config') AND name = 'usar_ambiente_teste'
)
BEGIN
  ALTER TABLE dbo.eng_estrutura_config
    ADD [usar_ambiente_teste] BIT NOT NULL CONSTRAINT DF_eng_estrutura_config_usar_teste DEFAULT 0;
END;

COMMIT TRANSACTION;
