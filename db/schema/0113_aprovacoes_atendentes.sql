SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- Quem decide as pendências do painel de aprovações, espelhando
-- portal_chamados_atendentes: uma linha = "este usuário, representando
-- este setor da empresa, atende as aprovações deste tipo".
--
-- O que filtra a fila é o TIPO (hoje só 'aumento_salarial'; quando
-- entrar um segundo tipo, basta cadastrar outras linhas -- nada de
-- migração nova). O SETOR é o setor do portal que o aprovador
-- representa, registrado junto da decisão; não filtra por
-- unidade/departamento do colaborador (isso é escopo de quem SOLICITA,
-- em portal_aprovacoes_escopo).
IF OBJECT_ID(N'dbo.portal_aprovacoes_atendentes', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_aprovacoes_atendentes (
    [id] UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT DF_portal_aprovacoes_atendentes_id DEFAULT NEWID()
      CONSTRAINT PK_portal_aprovacoes_atendentes PRIMARY KEY,
    [usuario_id] UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT FK_portal_aprovacoes_atendentes_usuario REFERENCES dbo.portal_usuarios([id]),
    [setor_id] UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT FK_portal_aprovacoes_atendentes_setor REFERENCES dbo.portal_setores([id]),
    [tipo] VARCHAR(40) NOT NULL,
    [criado_em] DATETIME2 NOT NULL
      CONSTRAINT DF_portal_aprovacoes_atendentes_criado_em DEFAULT SYSDATETIME(),
    CONSTRAINT UQ_portal_aprovacoes_atendentes_usuario_setor_tipo
      UNIQUE ([usuario_id], [setor_id], [tipo])
  );

  CREATE INDEX IX_portal_aprovacoes_atendentes_tipo
    ON dbo.portal_aprovacoes_atendentes ([tipo], [usuario_id]);
END;

COMMIT TRANSACTION;
