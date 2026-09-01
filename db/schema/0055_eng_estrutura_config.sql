SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.eng_estrutura_config', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.eng_estrutura_config (
    [id] INT NOT NULL CONSTRAINT PK_eng_estrutura_config PRIMARY KEY CHECK ([id] = 1),
    [url_consulta_estrutura] NVARCHAR(300) NULL,
    [url_validar_itens] NVARCHAR(300) NULL,
    [url_atualizar_estrutura] NVARCHAR(300) NULL,
    [atualizado_em] DATETIME2 NULL,
    [atualizado_por] NVARCHAR(150) NULL
  );
END;

COMMIT TRANSACTION;
