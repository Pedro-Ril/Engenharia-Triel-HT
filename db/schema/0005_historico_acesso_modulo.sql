/*
  =========================================================
  Portal Triel-HT — histórico de acesso a módulos
  =========================================================

  Registra cada vez que um usuário abre um módulo restrito
  (ver requireModuloAccess em src/lib/auth/autorizacao.ts).
  Usado na home para montar o card "Acessados recentemente"
  e para destacar o módulo mais usado por cada pessoa no
  botão principal.

  É um log de eventos (uma linha por acesso, sem
  deduplicação) — as agregações (último acesso, total de
  acessos) são calculadas na consulta, não gravadas.

  Execução: manual, direto no SQL Server de destino.
  `sqlcmd -f i:65001 -i este-arquivo.sql`.
  =========================================================
*/

SET XACT_ABORT ON;

BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.portal_acesso_modulo_historico', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_acesso_modulo_historico (
    [id]          UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT [DF_portal_acesso_modulo_historico_id]
        DEFAULT NEWID(),
    [usuario_id]  UNIQUEIDENTIFIER NOT NULL,
    [modulo_id]   UNIQUEIDENTIFIER NOT NULL,
    [acessado_em] DATETIME2         NOT NULL
      CONSTRAINT [DF_portal_acesso_modulo_historico_acessado_em]
        DEFAULT SYSDATETIME(),

    CONSTRAINT [PK_portal_acesso_modulo_historico]
      PRIMARY KEY ([id]),

    CONSTRAINT [FK_portal_acesso_modulo_historico_usuario]
      FOREIGN KEY ([usuario_id])
      REFERENCES dbo.portal_usuarios ([id])
      ON DELETE CASCADE,

    CONSTRAINT [FK_portal_acesso_modulo_historico_modulo]
      FOREIGN KEY ([modulo_id])
      REFERENCES dbo.portal_modulos ([id])
      ON DELETE CASCADE
  );
END;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_portal_acesso_modulo_historico_usuario'
)
BEGIN
  CREATE INDEX [IX_portal_acesso_modulo_historico_usuario]
    ON dbo.portal_acesso_modulo_historico ([usuario_id], [acessado_em] DESC);
END;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_portal_acesso_modulo_historico_modulo'
)
BEGIN
  CREATE INDEX [IX_portal_acesso_modulo_historico_modulo]
    ON dbo.portal_acesso_modulo_historico ([modulo_id]);
END;
GO

COMMIT TRANSACTION;
