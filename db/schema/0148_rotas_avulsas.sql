/*
 * Rotas avulsas: endpoints que outros sistemas chamam sem login no
 * Portal, autenticados por token próprio de cada rota. A primeira é a
 * impressão de PDF direto na impressora (IPP), sem passar pelo Windows.
 *
 * - portal_rotas_avulsas: uma linha por rota (liga/desliga, limites de
 *   requisição e a configuração específica dela em JSON). Nome e
 *   descrição ficam no catálogo em código (src/lib/rotas-avulsas/catalogo.ts).
 * - portal_rotas_avulsas_tokens: tokens por rota. Só o SHA-256 do token
 *   é guardado; o token em si aparece uma única vez, na criação.
 * - portal_rotas_avulsas_logs: toda requisição, aceita ou recusada.
 * - portal_impressao_impressoras / portal_impressao_trabalhos: as
 *   impressoras da rota de impressão e cada PDF enviado (o PDF não é
 *   guardado, só o hash e os dados).
 */
SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.portal_rotas_avulsas', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_rotas_avulsas (
    [chave] VARCHAR(60) NOT NULL CONSTRAINT PK_portal_rotas_avulsas PRIMARY KEY,
    [ativo] BIT NOT NULL CONSTRAINT DF_portal_rotas_avulsas_ativo DEFAULT 0,
    [limite_por_segundo] INT NOT NULL CONSTRAINT DF_portal_rotas_avulsas_seg DEFAULT 1,
    [rajada] INT NOT NULL CONSTRAINT DF_portal_rotas_avulsas_rajada DEFAULT 5,
    [limite_por_minuto] INT NOT NULL CONSTRAINT DF_portal_rotas_avulsas_min DEFAULT 60,
    [config] NVARCHAR(MAX) NULL,
    [atualizado_em] DATETIME2 NULL,
    [atualizado_por] NVARCHAR(100) NULL
  );
END;

IF NOT EXISTS (SELECT 1 FROM dbo.portal_rotas_avulsas WHERE [chave] = 'impressao-pdf')
BEGIN
  INSERT INTO dbo.portal_rotas_avulsas ([chave], [ativo], [limite_por_segundo], [rajada], [limite_por_minuto], [config])
  VALUES ('impressao-pdf', 0, 1, 5, 60, N'{"tamanhoMaxMb":20,"paginasMax":200,"copiasMax":10}');
END;

IF OBJECT_ID(N'dbo.portal_rotas_avulsas_tokens', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_rotas_avulsas_tokens (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_portal_rotas_avulsas_tokens_id DEFAULT NEWID()
      CONSTRAINT PK_portal_rotas_avulsas_tokens PRIMARY KEY,
    [rota_chave] VARCHAR(60) NOT NULL
      CONSTRAINT FK_portal_rotas_avulsas_tokens_rota REFERENCES dbo.portal_rotas_avulsas ([chave]),
    [nome] NVARCHAR(120) NOT NULL,
    [prefixo] VARCHAR(20) NOT NULL,
    [token_hash] VARBINARY(32) NOT NULL,
    [escopo] NVARCHAR(MAX) NULL,
    [expira_em] DATETIME2 NULL,
    [revogado_em] DATETIME2 NULL,
    [revogado_por] NVARCHAR(100) NULL,
    [ultimo_uso_em] DATETIME2 NULL,
    [ultimo_ip] VARCHAR(64) NULL,
    [total_usos] INT NOT NULL CONSTRAINT DF_portal_rotas_avulsas_tokens_usos DEFAULT 0,
    [criado_em] DATETIME2 NOT NULL CONSTRAINT DF_portal_rotas_avulsas_tokens_criado DEFAULT SYSDATETIME(),
    [criado_por] NVARCHAR(100) NOT NULL
  );
  CREATE UNIQUE INDEX UX_portal_rotas_avulsas_tokens_hash ON dbo.portal_rotas_avulsas_tokens ([token_hash]);
  CREATE INDEX IX_portal_rotas_avulsas_tokens_rota ON dbo.portal_rotas_avulsas_tokens ([rota_chave]);
END;

IF OBJECT_ID(N'dbo.portal_rotas_avulsas_logs', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_rotas_avulsas_logs (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_portal_rotas_avulsas_logs_id DEFAULT NEWID()
      CONSTRAINT PK_portal_rotas_avulsas_logs PRIMARY KEY NONCLUSTERED,
    [rota_chave] VARCHAR(60) NOT NULL,
    [token_id] UNIQUEIDENTIFIER NULL,
    [token_nome] NVARCHAR(120) NULL,
    [ip_origem] VARCHAR(64) NULL,
    [metodo] VARCHAR(10) NOT NULL,
    [caminho] NVARCHAR(300) NOT NULL,
    [status_http] INT NOT NULL,
    [resultado] VARCHAR(20) NOT NULL,
    [motivo] NVARCHAR(400) NULL,
    [detalhes] NVARCHAR(MAX) NULL,
    [duracao_ms] INT NULL,
    [criado_em] DATETIME2 NOT NULL CONSTRAINT DF_portal_rotas_avulsas_logs_criado DEFAULT SYSDATETIME()
  );
  CREATE CLUSTERED INDEX IX_portal_rotas_avulsas_logs_rota_data ON dbo.portal_rotas_avulsas_logs ([rota_chave], [criado_em] DESC);
END;

IF OBJECT_ID(N'dbo.portal_impressao_impressoras', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_impressao_impressoras (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_portal_impressao_impressoras_id DEFAULT NEWID()
      CONSTRAINT PK_portal_impressao_impressoras PRIMARY KEY,
    [codigo] VARCHAR(40) NOT NULL,
    [nome] NVARCHAR(120) NOT NULL,
    [endereco] VARCHAR(255) NOT NULL,
    [porta] INT NOT NULL CONSTRAINT DF_portal_impressao_impressoras_porta DEFAULT 631,
    [caminho_ipp] VARCHAR(100) NOT NULL CONSTRAINT DF_portal_impressao_impressoras_caminho DEFAULT '/ipp/print',
    [usar_tls] BIT NOT NULL CONSTRAINT DF_portal_impressao_impressoras_tls DEFAULT 1,
    [certificado_sha256] VARCHAR(100) NULL,
    [frente_verso_padrao] BIT NOT NULL CONSTRAINT DF_portal_impressao_impressoras_fv DEFAULT 0,
    [ativo] BIT NOT NULL CONSTRAINT DF_portal_impressao_impressoras_ativo DEFAULT 1,
    [criado_em] DATETIME2 NOT NULL CONSTRAINT DF_portal_impressao_impressoras_criado DEFAULT SYSDATETIME(),
    [atualizado_em] DATETIME2 NULL,
    [atualizado_por] NVARCHAR(100) NULL
  );
  CREATE UNIQUE INDEX UX_portal_impressao_impressoras_codigo ON dbo.portal_impressao_impressoras ([codigo]);
END;

IF OBJECT_ID(N'dbo.portal_impressao_trabalhos', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_impressao_trabalhos (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_portal_impressao_trabalhos_id DEFAULT NEWID()
      CONSTRAINT PK_portal_impressao_trabalhos PRIMARY KEY,
    [token_id] UNIQUEIDENTIFIER NOT NULL,
    [chave_idempotencia] VARCHAR(100) NULL,
    [impressora_id] UNIQUEIDENTIFIER NOT NULL,
    [impressora_codigo] VARCHAR(40) NOT NULL,
    [nome_arquivo] NVARCHAR(255) NULL,
    [copias] INT NOT NULL,
    [frente_verso] BIT NOT NULL,
    [paginas] INT NOT NULL,
    [tamanho_bytes] INT NOT NULL,
    [sha256] CHAR(64) NOT NULL,
    [ipp_job_id] INT NULL,
    [estado] VARCHAR(20) NOT NULL,
    [estado_detalhe] NVARCHAR(400) NULL,
    [criado_em] DATETIME2 NOT NULL CONSTRAINT DF_portal_impressao_trabalhos_criado DEFAULT SYSDATETIME(),
    [atualizado_em] DATETIME2 NOT NULL CONSTRAINT DF_portal_impressao_trabalhos_atualizado DEFAULT SYSDATETIME()
  );
  CREATE UNIQUE INDEX UX_portal_impressao_trabalhos_idempotencia
    ON dbo.portal_impressao_trabalhos ([token_id], [chave_idempotencia])
    WHERE [chave_idempotencia] IS NOT NULL;
END;

COMMIT TRANSACTION;
