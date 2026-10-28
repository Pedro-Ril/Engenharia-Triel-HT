/*
 * Alçadas de aprovação -- genéricas, para todos os tipos do centro de
 * aprovações (reajuste salarial, pedido de compra e os próximos).
 *
 * Uma ALÇADA é a cadeia de aprovação de um tipo, opcionalmente
 * restrita a uma empresa e/ou a um setor. Vale a regra mais
 * específica que casar com a solicitação (empresa + setor > empresa >
 * setor > padrão do tipo, sem nenhum dos dois).
 *
 * A cadeia tem NÍVEIS em ordem; cada nível tem um ou mais usuários.
 * Todos os níveis precisam aprovar, um depois do outro, e dentro do
 * nível basta um usuário. Qualquer nível pode devolver ao solicitante,
 * que ajusta e reenvia -- o reenvio abre um novo CICLO, do nível 1.
 *
 * ETAPAS são a cadeia "congelada" de cada item em cada ciclo (nome e
 * ordem do nível no momento do envio). Quem decide a etapa é lido ao
 * vivo do nível, então trocar as pessoas de um nível vale também para
 * o que já está na fila.
 *
 * HISTÓRICO guarda cada passo de cada item (envio, aprovação por nível,
 * devolução, reenvio); ALCADAS_HISTORICO, cada mudança de configuração.
 */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.portal_alcadas', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_alcadas (
    [id] UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT DF_portal_alcadas_id DEFAULT NEWID()
      CONSTRAINT PK_portal_alcadas PRIMARY KEY,
    /* Tipo de aprovação (tipos-aprovacao.ts): aumento_salarial, pedido_compra... */
    [tipo] VARCHAR(40) NOT NULL,
    /* empr_id do Focco; NULL = qualquer empresa. */
    [empresa] INT NULL,
    /* Setor (texto, como vem do RH / do item); NULL = qualquer setor. */
    [setor] NVARCHAR(200) NULL,
    [ativo] BIT NOT NULL
      CONSTRAINT DF_portal_alcadas_ativo DEFAULT 1,
    [criado_em] DATETIME2 NOT NULL
      CONSTRAINT DF_portal_alcadas_criado_em DEFAULT SYSDATETIME(),
    [criado_por] NVARCHAR(200) NULL,
    [atualizado_em] DATETIME2 NOT NULL
      CONSTRAINT DF_portal_alcadas_atualizado_em DEFAULT SYSDATETIME(),
    [atualizado_por] NVARCHAR(200) NULL
  );

  /* Uma regra ativa por combinação (NULL conta como valor no índice único do SQL Server). */
  CREATE UNIQUE INDEX UX_portal_alcadas_regra
    ON dbo.portal_alcadas ([tipo], [empresa], [setor])
    WHERE [ativo] = 1;
END;

IF OBJECT_ID(N'dbo.portal_alcadas_niveis', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_alcadas_niveis (
    [id] UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT DF_portal_alcadas_niveis_id DEFAULT NEWID()
      CONSTRAINT PK_portal_alcadas_niveis PRIMARY KEY,
    [alcada_id] UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT FK_portal_alcadas_niveis_alcada REFERENCES dbo.portal_alcadas([id]),
    /* 1, 2, 3... -- a ordem em que a solicitação sobe. */
    [ordem] INT NOT NULL,
    [nome] NVARCHAR(100) NOT NULL,
    /* Nível removido some da configuração, mas continua referenciado pelas etapas antigas. */
    [ativo] BIT NOT NULL
      CONSTRAINT DF_portal_alcadas_niveis_ativo DEFAULT 1,
    [criado_em] DATETIME2 NOT NULL
      CONSTRAINT DF_portal_alcadas_niveis_criado_em DEFAULT SYSDATETIME()
  );

  CREATE INDEX IX_portal_alcadas_niveis_alcada
    ON dbo.portal_alcadas_niveis ([alcada_id], [ordem]);
END;

IF OBJECT_ID(N'dbo.portal_alcadas_niveis_usuarios', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_alcadas_niveis_usuarios (
    [id] UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT DF_portal_alcadas_niveis_usuarios_id DEFAULT NEWID()
      CONSTRAINT PK_portal_alcadas_niveis_usuarios PRIMARY KEY,
    [nivel_id] UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT FK_portal_alcadas_niveis_usuarios_nivel REFERENCES dbo.portal_alcadas_niveis([id]),
    [usuario_id] UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT FK_portal_alcadas_niveis_usuarios_usuario REFERENCES dbo.portal_usuarios([id]),
    [criado_em] DATETIME2 NOT NULL
      CONSTRAINT DF_portal_alcadas_niveis_usuarios_criado_em DEFAULT SYSDATETIME(),
    CONSTRAINT UX_portal_alcadas_niveis_usuarios UNIQUE ([nivel_id], [usuario_id])
  );

  CREATE INDEX IX_portal_alcadas_niveis_usuarios_usuario
    ON dbo.portal_alcadas_niveis_usuarios ([usuario_id], [nivel_id]);
END;

IF OBJECT_ID(N'dbo.portal_aprovacoes_etapas', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_aprovacoes_etapas (
    [id] UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT DF_portal_aprovacoes_etapas_id DEFAULT NEWID()
      CONSTRAINT PK_portal_aprovacoes_etapas PRIMARY KEY,
    [tipo] VARCHAR(40) NOT NULL,
    /* id do item na tabela do tipo (colaborador do reajuste, pedido de compra...). */
    [item_id] UNIQUEIDENTIFIER NOT NULL,
    /* 1 no envio; +1 a cada reenvio depois de uma devolução. */
    [ciclo] INT NOT NULL,
    [ordem] INT NOT NULL,
    [nivel_id] UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT FK_portal_aprovacoes_etapas_nivel REFERENCES dbo.portal_alcadas_niveis([id]),
    [nivel_nome] NVARCHAR(100) NOT NULL,
    /* aguardando (nível ainda não chegou) | pendente (é a vez dele) | aprovado | devolvido | encerrado (ciclo terminou antes) */
    [status] VARCHAR(20) NOT NULL,
    [decidido_por_usuario_id] UNIQUEIDENTIFIER NULL
      CONSTRAINT FK_portal_aprovacoes_etapas_decisor REFERENCES dbo.portal_usuarios([id]),
    [decidido_por_nome] NVARCHAR(200) NULL,
    [decidido_em] DATETIME2 NULL,
    [comentario] NVARCHAR(2000) NULL,
    [criado_em] DATETIME2 NOT NULL
      CONSTRAINT DF_portal_aprovacoes_etapas_criado_em DEFAULT SYSDATETIME()
  );

  CREATE UNIQUE INDEX UX_portal_aprovacoes_etapas_item
    ON dbo.portal_aprovacoes_etapas ([item_id], [ciclo], [ordem]);

  /* A fila de cada pessoa: etapas pendentes por nível. */
  CREATE INDEX IX_portal_aprovacoes_etapas_pendentes
    ON dbo.portal_aprovacoes_etapas ([nivel_id], [tipo], [item_id])
    WHERE [status] = 'pendente';
END;

IF OBJECT_ID(N'dbo.portal_aprovacoes_historico', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_aprovacoes_historico (
    [id] UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT DF_portal_aprovacoes_historico_id DEFAULT NEWID()
      CONSTRAINT PK_portal_aprovacoes_historico PRIMARY KEY,
    [tipo] VARCHAR(40) NOT NULL,
    [item_id] UNIQUEIDENTIFIER NOT NULL,
    /* enviado | reenviado | aprovado_nivel | aprovado | devolvido */
    [acao] VARCHAR(30) NOT NULL,
    [ciclo] INT NULL,
    [nivel_ordem] INT NULL,
    [nivel_nome] NVARCHAR(100) NULL,
    [usuario_id] UNIQUEIDENTIFIER NULL,
    [usuario_nome] NVARCHAR(200) NULL,
    [comentario] NVARCHAR(2000) NULL,
    [criado_em] DATETIME2 NOT NULL
      CONSTRAINT DF_portal_aprovacoes_historico_criado_em DEFAULT SYSDATETIME()
  );

  CREATE INDEX IX_portal_aprovacoes_historico_item
    ON dbo.portal_aprovacoes_historico ([item_id], [criado_em]);
END;

IF OBJECT_ID(N'dbo.portal_alcadas_historico', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_alcadas_historico (
    [id] UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT DF_portal_alcadas_historico_id DEFAULT NEWID()
      CONSTRAINT PK_portal_alcadas_historico PRIMARY KEY,
    [alcada_id] UNIQUEIDENTIFIER NULL,
    [tipo] VARCHAR(40) NOT NULL,
    /* O que mudou, em português, para ler na tela. */
    [descricao] NVARCHAR(1000) NOT NULL,
    [usuario_id] UNIQUEIDENTIFIER NULL,
    [usuario_nome] NVARCHAR(200) NULL,
    [criado_em] DATETIME2 NOT NULL
      CONSTRAINT DF_portal_alcadas_historico_criado_em DEFAULT SYSDATETIME()
  );

  CREATE INDEX IX_portal_alcadas_historico_tipo
    ON dbo.portal_alcadas_historico ([tipo], [criado_em] DESC);
END;

COMMIT TRANSACTION;
