SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.portal_chamados_config', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_chamados_config (
    id INT NOT NULL CONSTRAINT PK_portal_chamados_config PRIMARY KEY CHECK (id = 1),
    url_publica NVARCHAR(300) NULL,
    atualizado_em DATETIME2 NOT NULL CONSTRAINT DF_portal_chamados_config_atualizado_em DEFAULT SYSDATETIME(),
    atualizado_por NVARCHAR(150) NULL
  );
END;

COMMIT TRANSACTION;
