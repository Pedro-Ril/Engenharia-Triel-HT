SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.integra_lantek_config', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.integra_lantek_config (
    id INT NOT NULL CONSTRAINT PK_integra_lantek_config PRIMARY KEY CHECK (id = 1),
    focco_api_base_url NVARCHAR(300) NULL,
    focco_api_chave NVARCHAR(50) NULL,
    focco_api_token NVARCHAR(300) NULL,
    pasta_dxf NVARCHAR(300) NULL,
    pasta_desenhos NVARCHAR(300) NULL,
    pasta_exportacao_agro NVARCHAR(300) NULL,
    pasta_exportacao_ve NVARCHAR(300) NULL,
    atualizado_em DATETIME2 NULL,
    atualizado_por NVARCHAR(150) NULL
  );
END;

COMMIT TRANSACTION;
