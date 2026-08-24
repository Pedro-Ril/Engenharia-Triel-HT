SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.portal_chamados_categorias', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_chamados_categorias (
    [id]        UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_portal_chamados_categorias_id DEFAULT NEWID(),
    [setor_id]  UNIQUEIDENTIFIER NOT NULL,
    [nome]      NVARCHAR(120)    NOT NULL,
    [ativo]     BIT              NOT NULL CONSTRAINT DF_portal_chamados_categorias_ativo DEFAULT 1,
    [ordem]     INT              NOT NULL CONSTRAINT DF_portal_chamados_categorias_ordem DEFAULT 0,
    [criado_em] DATETIME2        NOT NULL CONSTRAINT DF_portal_chamados_categorias_criado_em DEFAULT SYSDATETIME(),
    CONSTRAINT PK_portal_chamados_categorias PRIMARY KEY ([id]),
    CONSTRAINT FK_portal_chamados_categorias_setor FOREIGN KEY ([setor_id])
      REFERENCES dbo.portal_setores ([id]),
    CONSTRAINT UQ_portal_chamados_categorias_setor_nome UNIQUE ([setor_id], [nome])
  );
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_portal_chamados_categorias_setor_id'
    AND object_id = OBJECT_ID('dbo.portal_chamados_categorias')
)
BEGIN
  CREATE INDEX IX_portal_chamados_categorias_setor_id ON dbo.portal_chamados_categorias ([setor_id]);
END;

/*
 * Nullable de propósito: chamados existentes foram abertos antes
 * de categoria existir. Passa a ser obrigatório só daqui pra
 * frente, exigido em src/app/api/chamados/route.ts — não dá pra
 * fazer NOT NULL sem inventar uma categoria falsa para o
 * histórico inteiro.
 */
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.portal_chamados') AND name = 'categoria_id'
)
BEGIN
  ALTER TABLE dbo.portal_chamados ADD [categoria_id] UNIQUEIDENTIFIER NULL;
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_portal_chamados_categoria'
)
BEGIN
  ALTER TABLE dbo.portal_chamados
    ADD CONSTRAINT FK_portal_chamados_categoria FOREIGN KEY ([categoria_id])
    REFERENCES dbo.portal_chamados_categorias ([id]);
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_portal_chamados_categoria_id'
    AND object_id = OBJECT_ID('dbo.portal_chamados')
)
BEGIN
  CREATE INDEX IX_portal_chamados_categoria_id ON dbo.portal_chamados ([categoria_id]);
END;

COMMIT TRANSACTION;
