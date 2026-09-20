SET XACT_ABORT ON;
BEGIN TRANSACTION;

/* NULL = nunca editada desde a criação -- ver atualizarAssinaturaGerada. */
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.portal_assinaturas_geradas') AND name = 'atualizado_em'
)
BEGIN
  ALTER TABLE dbo.portal_assinaturas_geradas ADD [atualizado_em] DATETIME2 NULL;
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.portal_assinaturas_geradas') AND name = 'atualizado_por'
)
BEGIN
  ALTER TABLE dbo.portal_assinaturas_geradas ADD [atualizado_por] NVARCHAR(150) NULL;
END;

/* Um evento por edição de verdade (uma assinatura pode ser editada mais de uma vez) -- mesmo molde de portal_assinaturas_downloads, alimenta o log de criações/edições/downloads no admin (ver listarLogAdmin). */
IF OBJECT_ID(N'dbo.portal_assinaturas_edicoes', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_assinaturas_edicoes (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_assinaturas_edicoes_id DEFAULT NEWID(),
    [assinatura_id] UNIQUEIDENTIFIER NOT NULL,
    [usuario_id] UNIQUEIDENTIFIER NULL,
    [usuario_nome] NVARCHAR(150) NOT NULL,
    [editado_em] DATETIME2 NOT NULL CONSTRAINT DF_assinaturas_edicoes_editado_em DEFAULT SYSDATETIME(),
    CONSTRAINT PK_assinaturas_edicoes PRIMARY KEY ([id]),
    CONSTRAINT FK_assinaturas_edicoes_assinatura FOREIGN KEY ([assinatura_id])
      REFERENCES dbo.portal_assinaturas_geradas ([id]) ON DELETE CASCADE,
    CONSTRAINT FK_assinaturas_edicoes_usuario FOREIGN KEY ([usuario_id])
      REFERENCES dbo.portal_usuarios ([id])
  );
END;

COMMIT TRANSACTION;
