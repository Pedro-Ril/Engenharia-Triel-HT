SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- Envelope genérico de qualquer aprovação enviada à direção -- hoje só
-- existe o tipo 'aumento_salarial' (ver portal_aprovacoes_aumento_salarial
-- logo abaixo), mas o desenho já comporta outros tipos no futuro sem
-- alterar esta tabela (só o "tipo" muda, e uma tabela de detalhe nova
-- entra ao lado). status/tipo validados na aplicação, não aqui -- mesmo
-- padrão já usado em portal_chamados.status.
IF OBJECT_ID(N'dbo.portal_aprovacoes', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_aprovacoes (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_portal_aprovacoes_id DEFAULT NEWID() PRIMARY KEY,
    [numero] INT NOT NULL IDENTITY(1,1),
    [tipo] VARCHAR(40) NOT NULL,
    [status] VARCHAR(20) NOT NULL CONSTRAINT DF_portal_aprovacoes_status DEFAULT 'pendente',
    [criado_por_usuario_id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_portal_aprovacoes_criador REFERENCES dbo.portal_usuarios([id]),
    [criado_por_nome] NVARCHAR(200) NOT NULL,
    [criado_em] DATETIME2 NOT NULL CONSTRAINT DF_portal_aprovacoes_criado_em DEFAULT SYSDATETIME(),
    [decidido_por_usuario_id] UNIQUEIDENTIFIER NULL CONSTRAINT FK_portal_aprovacoes_decisor REFERENCES dbo.portal_usuarios([id]),
    [decidido_por_nome] NVARCHAR(200) NULL,
    [decidido_em] DATETIME2 NULL,
    [comentario_decisao] NVARCHAR(2000) NULL,
    [atualizado_em] DATETIME2 NOT NULL CONSTRAINT DF_portal_aprovacoes_atualizado_em DEFAULT SYSDATETIME(),
    CONSTRAINT UQ_portal_aprovacoes_numero UNIQUE ([numero])
  );

  CREATE NONCLUSTERED INDEX IX_portal_aprovacoes_status_tipo ON dbo.portal_aprovacoes ([status], [tipo], [criado_em]);
  CREATE NONCLUSTERED INDEX IX_portal_aprovacoes_criador ON dbo.portal_aprovacoes ([criado_por_usuario_id]);
END;

-- Detalhe específico de "aumento salarial" -- 1:1 com portal_aprovacoes
-- pelo mesmo id. funcionario_*/departamento/setor/salario_atual são
-- FOTO do momento da solicitação (o Firebird pode mudar depois, o
-- registro não -- mesmo motivo de portal_chamados.solicitante_departamento).
IF OBJECT_ID(N'dbo.portal_aprovacoes_aumento_salarial', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_aprovacoes_aumento_salarial (
    [aprovacao_id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_portal_aprovacoes_aumento_salarial PRIMARY KEY
      CONSTRAINT FK_portal_aprov_aumento_aprovacao REFERENCES dbo.portal_aprovacoes([id]),
    [funcionario_codigo] VARCHAR(30) NOT NULL,
    [funcionario_nome] NVARCHAR(200) NOT NULL,
    [funcionario_cpf] VARCHAR(14) NULL,
    [departamento] NVARCHAR(200) NULL,
    [setor] NVARCHAR(200) NULL,
    [salario_atual] DECIMAL(14,2) NOT NULL,
    [valor_reajuste] DECIMAL(14,2) NOT NULL,
    [percentual_reajuste] DECIMAL(9,4) NOT NULL,
    [novo_salario] DECIMAL(14,2) NOT NULL,
    [justificativa] NVARCHAR(2000) NULL
  );

  CREATE NONCLUSTERED INDEX IX_portal_aprov_aumento_funcionario ON dbo.portal_aprovacoes_aumento_salarial ([funcionario_codigo]);
END;

COMMIT TRANSACTION;
