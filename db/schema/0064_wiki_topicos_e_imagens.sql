SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.portal_wiki_topicos', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_wiki_topicos (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_portal_wiki_topicos PRIMARY KEY DEFAULT NEWID(),
    nome NVARCHAR(150) NOT NULL,
    icone NVARCHAR(60) NULL,
    criado_em DATETIME2 NOT NULL CONSTRAINT DF_portal_wiki_topicos_criado_em DEFAULT SYSDATETIME()
  );
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.portal_wiki_artigos') AND name = 'topico_id'
)
BEGIN
  ALTER TABLE dbo.portal_wiki_artigos
    ADD topico_id UNIQUEIDENTIFIER NULL
      CONSTRAINT FK_portal_wiki_artigos_topico REFERENCES dbo.portal_wiki_topicos(id) ON DELETE SET NULL;
END;

IF OBJECT_ID(N'dbo.portal_wiki_imagens', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_wiki_imagens (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_portal_wiki_imagens PRIMARY KEY DEFAULT NEWID(),
    tipo_mime NVARCHAR(100) NOT NULL,
    tamanho_bytes INT NOT NULL,
    conteudo VARBINARY(MAX) NOT NULL,
    criado_por_usuario_id UNIQUEIDENTIFIER NULL
      CONSTRAINT FK_portal_wiki_imagens_usuario REFERENCES dbo.portal_usuarios(id),
    criado_em DATETIME2 NOT NULL CONSTRAINT DF_portal_wiki_imagens_criado_em DEFAULT SYSDATETIME()
  );
END;

COMMIT TRANSACTION;
