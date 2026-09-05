SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.portal_configuracao_smtp', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_configuracao_smtp (
    id INT NOT NULL CONSTRAINT PK_portal_configuracao_smtp PRIMARY KEY CHECK (id = 1),
    host NVARCHAR(200) NOT NULL,
    porta INT NOT NULL,
    criptografia VARCHAR(10) NOT NULL CONSTRAINT DF_portal_configuracao_smtp_criptografia DEFAULT 'tls',
    autenticacao_ativa BIT NOT NULL CONSTRAINT DF_portal_configuracao_smtp_auth_ativa DEFAULT 1,
    usuario NVARCHAR(200) NULL,
    senha_cifrada VARBINARY(512) NULL,
    remetente_nome NVARCHAR(150) NULL,
    remetente_email NVARCHAR(256) NOT NULL,
    atualizado_em DATETIME2 NOT NULL CONSTRAINT DF_portal_configuracao_smtp_atualizado_em DEFAULT SYSDATETIME(),
    atualizado_por NVARCHAR(150) NULL
  );
END;

COMMIT TRANSACTION;
