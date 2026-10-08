/*
 * Log de integração: a chamada externa passa a guardar o que foi
 * pedido e o que voltou, não só "deu certo em X ms".
 *
 * Estende a tabela que já existe em vez de criar outra: ela já
 * alimenta o status dos serviços (Monitoramento > Visão geral) e a
 * aba de Logs. Duas tabelas para o mesmo evento significariam dois
 * lugares para consultar e manter.
 *
 * Os corpos são gravados truncados pela aplicação (ver
 * src/lib/monitoramento/integracao-externa.ts) -- NVARCHAR(MAX) aqui
 * é o tipo, não um convite a guardar resposta inteira de megabytes.
 */
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.portal_monitoramento_chamadas_externas') AND name = 'modulo_chave')
  ALTER TABLE dbo.portal_monitoramento_chamadas_externas ADD [modulo_chave] VARCHAR(60) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.portal_monitoramento_chamadas_externas') AND name = 'metodo')
  ALTER TABLE dbo.portal_monitoramento_chamadas_externas ADD [metodo] VARCHAR(10) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.portal_monitoramento_chamadas_externas') AND name = 'url')
  ALTER TABLE dbo.portal_monitoramento_chamadas_externas ADD [url] NVARCHAR(1000) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.portal_monitoramento_chamadas_externas') AND name = 'status_http')
  ALTER TABLE dbo.portal_monitoramento_chamadas_externas ADD [status_http] INT NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.portal_monitoramento_chamadas_externas') AND name = 'requisicao')
  ALTER TABLE dbo.portal_monitoramento_chamadas_externas ADD [requisicao] NVARCHAR(MAX) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.portal_monitoramento_chamadas_externas') AND name = 'resposta')
  ALTER TABLE dbo.portal_monitoramento_chamadas_externas ADD [resposta] NVARCHAR(MAX) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.portal_monitoramento_chamadas_externas') AND name = 'usuario_id')
  ALTER TABLE dbo.portal_monitoramento_chamadas_externas ADD [usuario_id] UNIQUEIDENTIFIER NULL;

COMMIT TRANSACTION;
GO

/* A listagem e a limpeza por idade sempre ordenam por data. */
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE object_id = OBJECT_ID(N'dbo.portal_monitoramento_chamadas_externas')
    AND name = 'IX_portal_chamadas_externas_criado_em'
)
  CREATE INDEX IX_portal_chamadas_externas_criado_em
    ON dbo.portal_monitoramento_chamadas_externas ([criado_em] DESC);
