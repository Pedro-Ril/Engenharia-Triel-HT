/*
 * Consulta 2D / 3D (terminal de fábrica): permissão de impressão.
 *
 * O visualizador do terminal foi feito de propósito sem imprimir nem
 * baixar (ver PdfViewerKiosk.tsx) -- é um kiosk de chão de fábrica.
 * Imprimir passa a ser liberado caso a caso, por usuário, e cada
 * impressão fica registrada: é desenho técnico controlado saindo em
 * papel.
 */
SET XACT_ABORT ON;
BEGIN TRANSACTION;

/* Quem pode imprimir. Sem linha = não imprime (administrador passa
   sempre, como no resto do portal -- decidido na aplicação). */
IF OBJECT_ID(N'dbo.portal_terminal_fabrica_impressao_permissoes', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_terminal_fabrica_impressao_permissoes (
    [usuario_id] UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT PK_portal_tf_impressao_permissoes PRIMARY KEY
      CONSTRAINT FK_portal_tf_impressao_permissoes_usuario
        REFERENCES dbo.portal_usuarios ([id]),
    [concedido_em] DATETIME2 NOT NULL
      CONSTRAINT DF_portal_tf_impressao_permissoes_concedido_em DEFAULT SYSDATETIME(),
    [concedido_por] NVARCHAR(200) NULL
  );
END;

/* Uma linha por impressão disparada. Espelha
   portal_terminal_fabrica_buscas, inclusive o ip_origem (ajuda a
   identificar a máquina de onde saiu o papel). */
IF OBJECT_ID(N'dbo.portal_terminal_fabrica_impressoes', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_terminal_fabrica_impressoes (
    [id] UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT DF_portal_tf_impressoes_id DEFAULT NEWID()
      CONSTRAINT PK_portal_tf_impressoes PRIMARY KEY,
    [usuario_id] UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT FK_portal_tf_impressoes_usuario
        REFERENCES dbo.portal_usuarios ([id]),
    [codigo_item] NVARCHAR(60) NOT NULL,
    [total_paginas] INT NULL,
    [impresso_em] DATETIME2 NOT NULL
      CONSTRAINT DF_portal_tf_impressoes_impresso_em DEFAULT SYSDATETIME(),
    [ip_origem] VARCHAR(64) NULL
  );
END;

/* A listagem do painel é sempre "mais recentes primeiro", paginada. */
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE object_id = OBJECT_ID(N'dbo.portal_terminal_fabrica_impressoes')
    AND name = 'IX_portal_tf_impressoes_impresso_em'
)
BEGIN
  CREATE INDEX IX_portal_tf_impressoes_impresso_em
    ON dbo.portal_terminal_fabrica_impressoes ([impresso_em] DESC);
END;

COMMIT TRANSACTION;
