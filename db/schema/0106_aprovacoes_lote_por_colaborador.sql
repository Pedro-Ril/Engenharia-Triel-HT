SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- Redesenho: uma solicitação (lote) passa a conter VÁRIOS colaboradores,
-- cada um decidido individualmente pela direção (aprovado/reprovado
-- separadamente, não é mais "a solicitação inteira"). Por isso o
-- status/decisão saem de portal_aprovacoes (o envelope/lote) e vão
-- para portal_aprovacoes_aumento_salarial (agora 1:N por lote, não
-- mais 1:1). As duas tabelas ainda não têm nenhuma linha em produção
-- (módulo em_desenvolvimento=1, nunca foi liberado) -- seguro recriar
-- do zero em vez de fazer migração de dado.

IF EXISTS (SELECT 1 FROM dbo.portal_aprovacoes_aumento_salarial)
   OR EXISTS (SELECT 1 FROM dbo.portal_aprovacoes)
BEGIN
  RAISERROR('portal_aprovacoes já tem dado -- não é seguro recriar sem migrar. Abortando.', 16, 1);
END;

IF OBJECT_ID(N'dbo.portal_aprovacoes_aumento_salarial', N'U') IS NOT NULL
BEGIN
  DROP TABLE dbo.portal_aprovacoes_aumento_salarial;
END;

-- portal_aprovacoes vira só o envelope do lote: quem criou, quando, e
-- a observação única (compartilhada por todos os colaboradores do
-- lote) -- não guarda mais status/decisão, que agora é por item.
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.portal_aprovacoes') AND name = 'status')
BEGIN
  IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.portal_aprovacoes') AND name = 'IX_portal_aprovacoes_status_tipo')
  BEGIN
    DROP INDEX IX_portal_aprovacoes_status_tipo ON dbo.portal_aprovacoes;
  END;
  ALTER TABLE dbo.portal_aprovacoes DROP CONSTRAINT DF_portal_aprovacoes_status;
  ALTER TABLE dbo.portal_aprovacoes DROP CONSTRAINT FK_portal_aprovacoes_decisor;
  ALTER TABLE dbo.portal_aprovacoes DROP COLUMN [status], [decidido_por_usuario_id], [decidido_por_nome], [decidido_em], [comentario_decisao];
END;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.portal_aprovacoes') AND name = 'observacao')
BEGIN
  ALTER TABLE dbo.portal_aprovacoes ADD [observacao] NVARCHAR(2000) NULL;
END;

CREATE TABLE dbo.portal_aprovacoes_aumento_salarial (
  [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_portal_aprov_aumento_id DEFAULT NEWID() PRIMARY KEY,
  [aprovacao_id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_portal_aprov_aumento_aprovacao REFERENCES dbo.portal_aprovacoes([id]),
  [funcionario_codigo] VARCHAR(30) NOT NULL,
  [funcionario_nome] NVARCHAR(200) NOT NULL,
  [funcionario_cpf] VARCHAR(14) NULL,
  [departamento] NVARCHAR(200) NULL,
  [setor] NVARCHAR(200) NULL,
  [salario_atual] DECIMAL(14,2) NOT NULL,
  [valor_reajuste] DECIMAL(14,2) NOT NULL,
  [percentual_reajuste] DECIMAL(9,4) NOT NULL,
  [novo_salario] DECIMAL(14,2) NOT NULL,
  [status] VARCHAR(20) NOT NULL CONSTRAINT DF_portal_aprov_aumento_status DEFAULT 'pendente',
  [decidido_por_usuario_id] UNIQUEIDENTIFIER NULL CONSTRAINT FK_portal_aprov_aumento_decisor REFERENCES dbo.portal_usuarios([id]),
  [decidido_por_nome] NVARCHAR(200) NULL,
  [decidido_em] DATETIME2 NULL,
  [comentario_decisao] NVARCHAR(2000) NULL,
  [criado_em] DATETIME2 NOT NULL CONSTRAINT DF_portal_aprov_aumento_criado_em DEFAULT SYSDATETIME(),
  [atualizado_em] DATETIME2 NOT NULL CONSTRAINT DF_portal_aprov_aumento_atualizado_em DEFAULT SYSDATETIME()
);

CREATE INDEX IX_portal_aprov_aumento_aprovacao_id ON dbo.portal_aprovacoes_aumento_salarial([aprovacao_id]);
CREATE INDEX IX_portal_aprov_aumento_status ON dbo.portal_aprovacoes_aumento_salarial([status]);

COMMIT TRANSACTION;
