/*
  =========================================================
  Portal Triel-HT — buscas no terminal de fábrica
  =========================================================

  O terminal de fábrica (src/app/terminal-fabrica) é público,
  sem login — não passa pelo sistema normal de módulos/
  permissões, então o histórico de acesso por módulo
  (portal_acesso_modulo_historico) nunca registra nada por
  lá. Esta tabela é um contador simples e separado, só para
  esse terminal: uma linha por busca de código de item.

  `usuario_id` é opcional (NULL) — a maioria das buscas é
  anônima (uso compartilhado no chão de fábrica), mas se a
  pessoa já estiver logada no navegador do terminal, a busca
  fica nomeada com ela.

  Execução: manual, direto no SQL Server de destino.
  `sqlcmd -f i:65001 -i este-arquivo.sql`.
  =========================================================
*/

SET XACT_ABORT ON;

BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.portal_terminal_fabrica_buscas', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_terminal_fabrica_buscas (
    [id]             UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT [DF_portal_terminal_fabrica_buscas_id]
        DEFAULT NEWID(),
    [usuario_id]     UNIQUEIDENTIFIER NULL,
    [codigo_buscado] NVARCHAR(60)      NOT NULL,
    [encontrado]     BIT               NOT NULL,
    [buscado_em]     DATETIME2         NOT NULL
      CONSTRAINT [DF_portal_terminal_fabrica_buscas_buscado_em]
        DEFAULT SYSDATETIME(),

    CONSTRAINT [PK_portal_terminal_fabrica_buscas]
      PRIMARY KEY ([id]),

    CONSTRAINT [FK_portal_terminal_fabrica_buscas_usuario]
      FOREIGN KEY ([usuario_id])
      REFERENCES dbo.portal_usuarios ([id])
      ON DELETE SET NULL
  );
END;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_portal_terminal_fabrica_buscas_buscado_em'
)
BEGIN
  CREATE INDEX [IX_portal_terminal_fabrica_buscas_buscado_em]
    ON dbo.portal_terminal_fabrica_buscas ([buscado_em] DESC);
END;
GO

COMMIT TRANSACTION;
