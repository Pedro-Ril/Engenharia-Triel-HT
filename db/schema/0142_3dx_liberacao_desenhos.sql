/*
 * 3DExperience → Liberação de desenhos em trabalho: o registro de tudo,
 * para análise no período de teste.
 *
 * Uma execução = uma rodada sobre a estrutura de um item pai: primeiro a
 * simulação (dry_run = 1), depois, se confirmada, a liberação real
 * (dry_run = 0, apontando a simulação de origem). Cada desenho da rodada
 * tem uma linha com o que havia antes, o que foi feito e a resposta crua
 * do 3DX (o 3DX é produção: liberar não tem desfazer simples).
 */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.portal_3dx_liberacoes', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_3dx_liberacoes (
    [id] UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT DF_portal_3dx_liberacoes_id DEFAULT NEWID()
      CONSTRAINT PK_portal_3dx_liberacoes PRIMARY KEY,
    [codigo_pai] NVARCHAR(50) NOT NULL,
    [dry_run] BIT NOT NULL,
    /* A simulação que originou esta liberação real. */
    [simulacao_id] UNIQUEIDENTIFIER NULL
      CONSTRAINT FK_portal_3dx_liberacoes_simulacao REFERENCES dbo.portal_3dx_liberacoes([id]),
    /* explodindo | buscando_desenhos | processando | concluida | erro */
    [status] VARCHAR(20) NOT NULL,
    [job_id] NVARCHAR(100) NULL,
    [total_itens] INT NULL,
    [total_desenhos] INT NULL,
    [total_em_trabalho] INT NULL,
    [total_liberados] INT NULL,
    [total_erros] INT NULL,
    [mensagem] NVARCHAR(2000) NULL,
    [usuario_id] UNIQUEIDENTIFIER NULL
      CONSTRAINT FK_portal_3dx_liberacoes_usuario REFERENCES dbo.portal_usuarios([id]),
    [usuario_nome] NVARCHAR(200) NOT NULL,
    [criado_em] DATETIME2 NOT NULL
      CONSTRAINT DF_portal_3dx_liberacoes_criado_em DEFAULT SYSDATETIME(),
    [finalizado_em] DATETIME2 NULL
  );

  CREATE INDEX IX_portal_3dx_liberacoes_criado_em ON dbo.portal_3dx_liberacoes ([criado_em] DESC);
END;

IF OBJECT_ID(N'dbo.portal_3dx_liberacoes_desenhos', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_3dx_liberacoes_desenhos (
    [id] UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT DF_portal_3dx_liberacoes_desenhos_id DEFAULT NEWID()
      CONSTRAINT PK_portal_3dx_liberacoes_desenhos PRIMARY KEY,
    [liberacao_id] UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT FK_portal_3dx_liberacoes_desenhos_liberacao REFERENCES dbo.portal_3dx_liberacoes([id]),
    [ordem] INT NOT NULL,
    /* O item da estrutura a que o desenho pertence (o primeiro, se o desenho aparecer em mais de um). */
    [item_codigo] NVARCHAR(50) NULL,
    [item_physical_id] VARCHAR(64) NULL,
    [item_revisao] NVARCHAR(20) NULL,
    [item_status] NVARCHAR(40) NULL,
    [item_nivel] INT NULL,
    [desenho_physical_id] VARCHAR(64) NOT NULL,
    [desenho_titulo] NVARCHAR(300) NULL,
    [desenho_revisao] NVARCHAR(20) NULL,
    [status_antes] NVARCHAR(40) NULL,
    /* seria_liberado | liberado | ja_liberado | ignorado | erro | pendente */
    [acao] VARCHAR(20) NOT NULL,
    [mensagem] NVARCHAR(2000) NULL,
    [resultado_3dx] NVARCHAR(MAX) NULL,
    [criado_em] DATETIME2 NOT NULL
      CONSTRAINT DF_portal_3dx_liberacoes_desenhos_criado_em DEFAULT SYSDATETIME()
  );

  CREATE INDEX IX_portal_3dx_liberacoes_desenhos_liberacao ON dbo.portal_3dx_liberacoes_desenhos ([liberacao_id], [ordem]);
END;

COMMIT TRANSACTION;
