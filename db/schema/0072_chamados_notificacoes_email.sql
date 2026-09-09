SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.portal_chamados_notificacoes_email', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_chamados_notificacoes_email (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_chamados_notif_email_id DEFAULT NEWID(),
    [chamado_numero] INT NOT NULL,
    [chamado_titulo] NVARCHAR(200) NOT NULL,
    [evento] VARCHAR(30) NOT NULL,
    [destinatario_email] NVARCHAR(320) NOT NULL,
    [destinatario_nome] NVARCHAR(200) NULL,
    [assunto] NVARCHAR(300) NOT NULL,
    [sucesso] BIT NOT NULL,
    [erro_mensagem] NVARCHAR(500) NULL,
    [enviado_em] DATETIME2 NOT NULL CONSTRAINT DF_chamados_notif_email_enviado_em DEFAULT SYSDATETIME(),
    CONSTRAINT PK_portal_chamados_notificacoes_email PRIMARY KEY ([id])
  );

  CREATE INDEX IX_chamados_notif_email_numero ON dbo.portal_chamados_notificacoes_email ([chamado_numero]);
  CREATE INDEX IX_chamados_notif_email_enviado_em ON dbo.portal_chamados_notificacoes_email ([enviado_em] DESC);
END;

COMMIT TRANSACTION;
