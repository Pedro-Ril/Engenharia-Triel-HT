SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.portal_preferencias_usuario', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_preferencias_usuario (
    [usuario_id]    UNIQUEIDENTIFIER NOT NULL,
    [tema]          VARCHAR(10)      NOT NULL CONSTRAINT DF_portal_preferencias_usuario_tema DEFAULT 'sistema',
    [atualizado_em] DATETIME2        NOT NULL CONSTRAINT DF_portal_preferencias_usuario_atualizado_em DEFAULT SYSDATETIME(),
    CONSTRAINT PK_portal_preferencias_usuario PRIMARY KEY ([usuario_id]),
    CONSTRAINT CK_portal_preferencias_usuario_tema CHECK ([tema] IN ('claro', 'escuro', 'sistema')),
    CONSTRAINT FK_portal_preferencias_usuario_usuario FOREIGN KEY ([usuario_id])
      REFERENCES dbo.portal_usuarios ([id]) ON DELETE CASCADE
  );
END;

COMMIT TRANSACTION;
