SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.portal_wiki_artigos', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_wiki_artigos (
    [id]               UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_portal_wiki_artigos_id DEFAULT NEWID(),
    [titulo]           NVARCHAR(200)    NOT NULL,
    [conteudo]         NVARCHAR(MAX)    NOT NULL,
    /* NULL = artigo geral (sistema como um todo), não amarrado a nenhum módulo. */
    [modulo_id]        UNIQUEIDENTIFIER NULL,
    /* Exclusivo para administradores, independente do módulo referenciado. */
    [privado_admin]    BIT              NOT NULL CONSTRAINT DF_portal_wiki_artigos_privado_admin DEFAULT 0,
    [ativo]            BIT              NOT NULL CONSTRAINT DF_portal_wiki_artigos_ativo DEFAULT 1,
    [ordem]            INT              NOT NULL CONSTRAINT DF_portal_wiki_artigos_ordem DEFAULT 0,
    [autor_usuario_id] UNIQUEIDENTIFIER NULL,
    [criado_em]        DATETIME2        NOT NULL CONSTRAINT DF_portal_wiki_artigos_criado_em DEFAULT SYSDATETIME(),
    [atualizado_em]    DATETIME2        NOT NULL CONSTRAINT DF_portal_wiki_artigos_atualizado_em DEFAULT SYSDATETIME(),
    CONSTRAINT PK_portal_wiki_artigos PRIMARY KEY ([id]),
    CONSTRAINT FK_portal_wiki_artigos_modulo FOREIGN KEY ([modulo_id])
      REFERENCES dbo.portal_modulos ([id]) ON DELETE SET NULL,
    CONSTRAINT FK_portal_wiki_artigos_autor FOREIGN KEY ([autor_usuario_id])
      REFERENCES dbo.portal_usuarios ([id]) ON DELETE SET NULL
  );
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_portal_wiki_artigos_modulo_id'
    AND object_id = OBJECT_ID('dbo.portal_wiki_artigos')
)
BEGIN
  CREATE INDEX IX_portal_wiki_artigos_modulo_id ON dbo.portal_wiki_artigos ([modulo_id]);
END;

COMMIT TRANSACTION;
