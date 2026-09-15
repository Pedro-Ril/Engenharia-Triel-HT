SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.portal_chamados') AND name = 'data_prevista_conclusao'
)
BEGIN
  ALTER TABLE dbo.portal_chamados ADD [data_prevista_conclusao] DATE NULL;
END;

-- Quem de fato abriu o chamado, quando diferente do solicitante (delegação/"abrir em nome de"). NULL = abriu para si mesmo (caso de sempre, até aqui).
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.portal_chamados') AND name = 'criado_por_usuario_id'
)
BEGIN
  ALTER TABLE dbo.portal_chamados ADD [criado_por_usuario_id] UNIQUEIDENTIFIER NULL;
END;

IF OBJECT_ID(N'dbo.portal_chamados_copia', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_chamados_copia (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_chamados_copia_id DEFAULT NEWID() PRIMARY KEY,
    [chamado_id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_chamados_copia_chamado REFERENCES dbo.portal_chamados([id]),
    [usuario_id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_chamados_copia_usuario REFERENCES dbo.portal_usuarios([id]),
    [adicionado_por_usuario_id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_chamados_copia_adicionado_por REFERENCES dbo.portal_usuarios([id]),
    [adicionado_em] DATETIME2 NOT NULL CONSTRAINT DF_chamados_copia_adicionado_em DEFAULT SYSDATETIME(),
    CONSTRAINT UQ_chamados_copia UNIQUE ([chamado_id], [usuario_id])
  );
END;

COMMIT TRANSACTION;
