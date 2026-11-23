/*
 * Plugins 3DX: ambiente (PRODUCAO / TESTE).
 *
 * Os nós de teste (dev-plm) e de produção gravam no MESMO banco e na MESMA fila. Sem ambiente, um nó de teste
 * pegaria um trabalho de produção (e uma ação manual "por nome" rodaria no 3DX errado). A partir daqui:
 *  - cada nó informa o ambiente em /App/triel/triel-plugins.properties (ambiente=TESTE|PRODUCAO); sem isso o nó
 *    trata todos os plugins como DESLIGADO;
 *  - modo e parâmetros são por plugin E por ambiente (portal_3dx_plugins_ambientes); portal_3dx_plugins vira só
 *    catálogo (nome, descrição, ordem). Os valores atuais viram a linha TESTE; PRODUCAO nasce DESLIGADO;
 *  - execuções, eventos e nós guardam o ambiente; a fila e a chave de deduplicação passam a ser por ambiente;
 *  - destinatário de aviso pode ser de um ambiente só (NULL = os dois).
 *
 * Aplicar com: sqlcmd -S pdmserver -U sa -d PortalTrielHT -C -f 65001 -i db/schema/0173_plugins_3dx_ambientes.sql
 */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.portal_3dx_plugins_ambientes', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_3dx_plugins_ambientes (
    [plugin_chave] VARCHAR(40) NOT NULL
      CONSTRAINT FK_portal_3dx_plugins_amb_plugin REFERENCES dbo.portal_3dx_plugins ([chave]),
    [ambiente] VARCHAR(10) NOT NULL
      CONSTRAINT CK_portal_3dx_plugins_amb_ambiente CHECK ([ambiente] IN ('PRODUCAO', 'TESTE')),
    [modo] VARCHAR(10) NOT NULL CONSTRAINT DF_portal_3dx_plugins_amb_modo DEFAULT 'DESLIGADO'
      CONSTRAINT CK_portal_3dx_plugins_amb_modo CHECK ([modo] IN ('DESLIGADO', 'SIMULACAO', 'ATIVO')),
    [parametros] NVARCHAR(MAX) NOT NULL CONSTRAINT DF_portal_3dx_plugins_amb_parametros DEFAULT N'{}'
      CONSTRAINT CK_portal_3dx_plugins_amb_parametros CHECK (ISJSON([parametros]) = 1),
    [atualizado_por_id] UNIQUEIDENTIFIER NULL
      CONSTRAINT FK_portal_3dx_plugins_amb_usuario REFERENCES dbo.portal_usuarios ([id]),
    [atualizado_por_nome] NVARCHAR(200) NULL,
    [atualizado_em] DATETIME2 NULL,
    CONSTRAINT PK_portal_3dx_plugins_ambientes PRIMARY KEY ([plugin_chave], [ambiente])
  );
END;

/* Os valores de hoje (só o dev-plm usa os plugins) viram TESTE; PRODUCAO começa DESLIGADO. */
IF COL_LENGTH(N'dbo.portal_3dx_plugins', N'modo') IS NOT NULL
BEGIN
  EXEC (N'
    INSERT INTO dbo.portal_3dx_plugins_ambientes
      ([plugin_chave], [ambiente], [modo], [parametros], [atualizado_por_id], [atualizado_por_nome], [atualizado_em])
    SELECT p.[chave], a.[ambiente], CASE WHEN a.[ambiente] = ''TESTE'' THEN p.[modo] ELSE ''DESLIGADO'' END,
      p.[parametros], p.[atualizado_por_id], p.[atualizado_por_nome], p.[atualizado_em]
    FROM dbo.portal_3dx_plugins p
    CROSS JOIN (VALUES (''TESTE''), (''PRODUCAO'')) AS a ([ambiente])
    WHERE NOT EXISTS (SELECT 1 FROM dbo.portal_3dx_plugins_ambientes x
                      WHERE x.[plugin_chave] = p.[chave] AND x.[ambiente] = a.[ambiente]);
    ALTER TABLE dbo.portal_3dx_plugins DROP CONSTRAINT CK_portal_3dx_plugins_modo, DF_portal_3dx_plugins_modo,
      CK_portal_3dx_plugins_parametros, DF_portal_3dx_plugins_parametros, FK_portal_3dx_plugins_atualizado_por;
    ALTER TABLE dbo.portal_3dx_plugins DROP COLUMN [modo], [parametros], [atualizado_por_id], [atualizado_por_nome],
      [atualizado_em];');
END;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.portal_3dx_plugins_execucoes') AND name = 'ambiente')
  ALTER TABLE dbo.portal_3dx_plugins_execucoes ADD [ambiente] VARCHAR(10) NOT NULL
    CONSTRAINT DF_portal_3dx_plugins_exec_ambiente DEFAULT 'TESTE' WITH VALUES;
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.portal_3dx_plugins_nos') AND name = 'ambiente')
  ALTER TABLE dbo.portal_3dx_plugins_nos ADD [ambiente] VARCHAR(10) NULL;
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.portal_3dx_plugins_eventos') AND name = 'ambiente')
  ALTER TABLE dbo.portal_3dx_plugins_eventos ADD [ambiente] VARCHAR(10) NULL;
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.portal_3dx_plugins_historico_config') AND name = 'ambiente')
  ALTER TABLE dbo.portal_3dx_plugins_historico_config ADD [ambiente] VARCHAR(10) NULL;
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.portal_3dx_plugins_destinatarios') AND name = 'ambiente')
  ALTER TABLE dbo.portal_3dx_plugins_destinatarios ADD [ambiente] VARCHAR(10) NULL;

COMMIT TRANSACTION;
GO

SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

/* Quem grava execução tem de dizer o ambiente: sem padrão (as linhas antigas já viraram TESTE acima). */
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_portal_3dx_plugins_exec_ambiente')
  ALTER TABLE dbo.portal_3dx_plugins_execucoes DROP CONSTRAINT DF_portal_3dx_plugins_exec_ambiente;

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_portal_3dx_plugins_exec_ambiente')
  ALTER TABLE dbo.portal_3dx_plugins_execucoes ADD CONSTRAINT CK_portal_3dx_plugins_exec_ambiente
    CHECK ([ambiente] IN ('PRODUCAO', 'TESTE'));
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_portal_3dx_plugins_nos_ambiente')
  ALTER TABLE dbo.portal_3dx_plugins_nos ADD CONSTRAINT CK_portal_3dx_plugins_nos_ambiente
    CHECK ([ambiente] IS NULL OR [ambiente] IN ('PRODUCAO', 'TESTE'));
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_portal_3dx_plugins_evt_ambiente')
  ALTER TABLE dbo.portal_3dx_plugins_eventos ADD CONSTRAINT CK_portal_3dx_plugins_evt_ambiente
    CHECK ([ambiente] IS NULL OR [ambiente] IN ('PRODUCAO', 'TESTE'));
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_portal_3dx_plugins_dest_ambiente')
  ALTER TABLE dbo.portal_3dx_plugins_destinatarios ADD CONSTRAINT CK_portal_3dx_plugins_dest_ambiente
    CHECK ([ambiente] IS NULL OR [ambiente] IN ('PRODUCAO', 'TESTE'));

/* Fila e deduplicação por ambiente. */
IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.portal_3dx_plugins_execucoes') AND name = 'UX_portal_3dx_plugins_exec_dedup')
  DROP INDEX UX_portal_3dx_plugins_exec_dedup ON dbo.portal_3dx_plugins_execucoes;
CREATE UNIQUE INDEX UX_portal_3dx_plugins_exec_dedup ON dbo.portal_3dx_plugins_execucoes ([plugin_chave], [ambiente], [chave_dedup])
  WHERE [chave_dedup] IS NOT NULL AND [status] IN ('pendente', 'processando');

IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.portal_3dx_plugins_execucoes') AND name = 'IX_portal_3dx_plugins_exec_fila')
  DROP INDEX IX_portal_3dx_plugins_exec_fila ON dbo.portal_3dx_plugins_execucoes;
CREATE INDEX IX_portal_3dx_plugins_exec_fila ON dbo.portal_3dx_plugins_execucoes ([status], [ambiente], [enfileirado_em])
  INCLUDE ([plugin_chave], [executar_apos], [ultimo_contato]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.portal_3dx_plugins_execucoes') AND name = 'IX_portal_3dx_plugins_exec_ambiente')
  CREATE INDEX IX_portal_3dx_plugins_exec_ambiente ON dbo.portal_3dx_plugins_execucoes ([ambiente], [enfileirado_em] DESC);

/* O login dos plugins (plugins-3dx/sql/criar_login_plugins.sql) precisa ler a configuração por ambiente. */
IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'triel_3dx_plugins')
  GRANT SELECT ON dbo.portal_3dx_plugins_ambientes TO [triel_3dx_plugins];

COMMIT TRANSACTION;
GO

/* Conferência */
SELECT p.[chave], a.[ambiente], a.[modo], a.[parametros]
FROM dbo.portal_3dx_plugins p JOIN dbo.portal_3dx_plugins_ambientes a ON a.[plugin_chave] = p.[chave]
ORDER BY p.[ordem], a.[ambiente];
SELECT [ambiente], COUNT(*) AS [execucoes] FROM dbo.portal_3dx_plugins_execucoes GROUP BY [ambiente];
GO
