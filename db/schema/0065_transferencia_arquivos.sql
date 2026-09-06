SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.portal_transferencia_config', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_transferencia_config (
    id INT NOT NULL CONSTRAINT PK_portal_transferencia_config PRIMARY KEY CHECK (id = 1),
    pasta_armazenamento NVARCHAR(300) NOT NULL,
    duracao_maxima_horas INT NULL,
    atualizado_em DATETIME2 NOT NULL CONSTRAINT DF_portal_transferencia_config_atualizado_em DEFAULT SYSDATETIME(),
    atualizado_por NVARCHAR(150) NULL
  );
END;

IF OBJECT_ID(N'dbo.portal_transferencias', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_transferencias (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_portal_transferencias PRIMARY KEY DEFAULT NEWID(),
    token VARCHAR(64) NOT NULL CONSTRAINT UQ_portal_transferencias_token UNIQUE,
    nome_original NVARCHAR(260) NOT NULL,
    tipo_mime NVARCHAR(150) NOT NULL,
    tamanho_bytes BIGINT NOT NULL,
    caminho_arquivo NVARCHAR(300) NOT NULL,
    mensagem NVARCHAR(1000) NULL,
    enviado_por_usuario_id UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT FK_portal_transferencias_usuario REFERENCES dbo.portal_usuarios(id),
    destinatario_email NVARCHAR(256) NULL,
    email_enviado BIT NOT NULL CONSTRAINT DF_portal_transferencias_email_enviado DEFAULT 0,
    criado_em DATETIME2 NOT NULL CONSTRAINT DF_portal_transferencias_criado_em DEFAULT SYSDATETIME(),
    expira_em DATETIME2 NOT NULL
  );
END;

COMMIT TRANSACTION;
