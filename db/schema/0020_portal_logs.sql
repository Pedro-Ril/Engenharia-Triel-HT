SET XACT_ABORT ON;
BEGIN TRANSACTION;

/*
 * Log estruturado de erros não tratados do servidor (ver
 * src/instrumentation.ts, hook onRequestError do Next.js —
 * dispara sozinho pra qualquer erro não capturado em rota de
 * API/Server Component/Server Action, sem precisar instrumentar
 * cada rota manualmente). Usado pela tela de Monitoramento do
 * admin. `detalhes` guarda o stack trace/contexto extra como
 * texto livre (não precisa ser JSON estruturado).
 */
IF OBJECT_ID(N'dbo.portal_logs', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_logs (
    [id]          UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_portal_logs_id DEFAULT NEWID(),
    [nivel]       VARCHAR(10)      NOT NULL CONSTRAINT CK_portal_logs_nivel CHECK ([nivel] IN ('info', 'aviso', 'erro')),
    [origem]      NVARCHAR(200)    NOT NULL,
    [mensagem]    NVARCHAR(2000)   NOT NULL,
    [detalhes]    NVARCHAR(MAX)    NULL,
    [metodo]      VARCHAR(10)      NULL,
    [caminho]     NVARCHAR(500)    NULL,
    [ip_origem]   VARCHAR(64)      NULL,
    [criado_em]   DATETIME2        NOT NULL CONSTRAINT DF_portal_logs_criado_em DEFAULT SYSDATETIME(),
    CONSTRAINT PK_portal_logs PRIMARY KEY ([id])
  );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_portal_logs_criado_em' AND object_id = OBJECT_ID(N'dbo.portal_logs'))
  CREATE INDEX IX_portal_logs_criado_em ON dbo.portal_logs ([criado_em] DESC);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_portal_logs_nivel_criado_em' AND object_id = OBJECT_ID(N'dbo.portal_logs'))
  CREATE INDEX IX_portal_logs_nivel_criado_em ON dbo.portal_logs ([nivel], [criado_em] DESC);
GO

COMMIT TRANSACTION;
