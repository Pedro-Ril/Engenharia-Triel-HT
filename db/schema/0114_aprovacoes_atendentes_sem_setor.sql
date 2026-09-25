SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- Remove o setor da tabela de aprovadores (criada em 0113 e ainda sem
-- nenhuma linha real). O setor era só um rótulo: não filtrava a fila,
-- não entrava em nenhuma decisão e não mudava nada no comportamento.
-- A capacidade é simplesmente "este usuário aprova este tipo" (sim/não).
IF EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.portal_aprovacoes_atendentes') AND name = 'setor_id'
)
BEGIN
  DROP TABLE dbo.portal_aprovacoes_atendentes;
END;

IF OBJECT_ID(N'dbo.portal_aprovacoes_atendentes', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_aprovacoes_atendentes (
    [id] UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT DF_portal_aprovacoes_atendentes_id DEFAULT NEWID()
      CONSTRAINT PK_portal_aprovacoes_atendentes PRIMARY KEY,
    [usuario_id] UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT FK_portal_aprovacoes_atendentes_usuario REFERENCES dbo.portal_usuarios([id]),
    [tipo] VARCHAR(40) NOT NULL,
    [criado_em] DATETIME2 NOT NULL
      CONSTRAINT DF_portal_aprovacoes_atendentes_criado_em DEFAULT SYSDATETIME(),
    CONSTRAINT UQ_portal_aprovacoes_atendentes_usuario_tipo UNIQUE ([usuario_id], [tipo])
  );

  CREATE INDEX IX_portal_aprovacoes_atendentes_tipo
    ON dbo.portal_aprovacoes_atendentes ([tipo], [usuario_id]);
END;

COMMIT TRANSACTION;
