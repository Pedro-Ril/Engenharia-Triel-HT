/*
 * Unidades por empresa (ex.: filiais/plantas) e o vínculo do usuário com
 * uma ou mais delas -- usado na abertura de chamado:
 *   - empresa sem unidade         -> chamado sem unidade;
 *   - usuário em uma unidade      -> já vem preenchida;
 *   - usuário em várias           -> escolhe entre as dele (obrigatório);
 *   - empresa com unidades, mas o usuário sem vínculo
 *                                 -> escolhe entre as da empresa (obrigatório).
 * Ver src/lib/empresas/unidades.ts.
 *
 * Unidade não é excluída, só desativada: chamados antigos apontam para ela.
 * No chamado ficam o id (filtro/gráfico) e o nome no momento da abertura
 * (foto, como [empresa] e [solicitante_departamento]).
 */
SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.portal_empresas_unidades', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_empresas_unidades (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_portal_empresas_unidades_id DEFAULT NEWID(),
    [empresa_id] UNIQUEIDENTIFIER NOT NULL,
    [nome] NVARCHAR(100) NOT NULL,
    [ativa] BIT NOT NULL CONSTRAINT DF_portal_empresas_unidades_ativa DEFAULT 1,
    [criado_em] DATETIME2 NOT NULL CONSTRAINT DF_portal_empresas_unidades_criado DEFAULT SYSDATETIME(),
    CONSTRAINT PK_portal_empresas_unidades PRIMARY KEY ([id]),
    CONSTRAINT FK_portal_empresas_unidades_empresa FOREIGN KEY ([empresa_id])
      REFERENCES dbo.portal_empresas ([id]),
    CONSTRAINT UQ_portal_empresas_unidades_nome UNIQUE ([empresa_id], [nome])
  );
END;

IF OBJECT_ID(N'dbo.portal_usuarios_unidades', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_usuarios_unidades (
    [usuario_id] UNIQUEIDENTIFIER NOT NULL,
    [unidade_id] UNIQUEIDENTIFIER NOT NULL,
    [criado_em] DATETIME2 NOT NULL CONSTRAINT DF_portal_usuarios_unidades_criado DEFAULT SYSDATETIME(),
    CONSTRAINT PK_portal_usuarios_unidades PRIMARY KEY ([usuario_id], [unidade_id]),
    CONSTRAINT FK_portal_usuarios_unidades_usuario FOREIGN KEY ([usuario_id])
      REFERENCES dbo.portal_usuarios ([id]) ON DELETE CASCADE,
    CONSTRAINT FK_portal_usuarios_unidades_unidade FOREIGN KEY ([unidade_id])
      REFERENCES dbo.portal_empresas_unidades ([id])
  );
  CREATE INDEX IX_portal_usuarios_unidades_unidade ON dbo.portal_usuarios_unidades ([unidade_id]);
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.portal_chamados') AND name = 'unidade_id'
)
BEGIN
  ALTER TABLE dbo.portal_chamados ADD [unidade_id] UNIQUEIDENTIFIER NULL;
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.portal_chamados') AND name = 'unidade'
)
BEGIN
  ALTER TABLE dbo.portal_chamados ADD [unidade] NVARCHAR(100) NULL;
END;

/* EXEC: a coluna acabou de ser criada neste mesmo lote -- referência direta não compila. */
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_portal_chamados_unidade')
BEGIN
  EXEC(N'ALTER TABLE dbo.portal_chamados ADD CONSTRAINT FK_portal_chamados_unidade
    FOREIGN KEY ([unidade_id]) REFERENCES dbo.portal_empresas_unidades ([id]);');
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE object_id = OBJECT_ID(N'dbo.portal_chamados') AND name = 'IX_portal_chamados_unidade'
)
BEGIN
  EXEC(N'CREATE INDEX IX_portal_chamados_unidade ON dbo.portal_chamados ([unidade_id]);');
END;

COMMIT TRANSACTION;
