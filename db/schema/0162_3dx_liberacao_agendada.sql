/*
 * Liberação de desenhos agendada: o usuário pede, o Portal espera 4
 * minutos (tempo de o 3DX indexar as relações), simula e libera sozinho
 * tudo o que está em trabalho, e avisa por e-mail no fim.
 *
 * - agendada_para: quando a rodada começa (status 'agendada' até lá);
 * - automatica: rodada do fluxo agendado (a simulação e a liberação que
 *   sai dela);
 * - notificado_em: quando o e-mail final saiu (gravado na simulação, que
 *   é a raiz do fluxo) -- também impede e-mail repetido.
 * A senha nunca vem para o banco: fica só na memória do servidor.
 */
SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.portal_3dx_liberacoes') AND name = 'agendada_para')
  ALTER TABLE dbo.portal_3dx_liberacoes ADD [agendada_para] DATETIME2 NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.portal_3dx_liberacoes') AND name = 'automatica')
  ALTER TABLE dbo.portal_3dx_liberacoes ADD [automatica] BIT NOT NULL CONSTRAINT DF_portal_3dx_liberacoes_automatica DEFAULT 0;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.portal_3dx_liberacoes') AND name = 'notificado_em')
  ALTER TABLE dbo.portal_3dx_liberacoes ADD [notificado_em] DATETIME2 NULL;

COMMIT TRANSACTION;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.portal_3dx_liberacoes') AND name = 'IX_portal_3dx_liberacoes_automatica')
  CREATE INDEX IX_portal_3dx_liberacoes_automatica ON dbo.portal_3dx_liberacoes ([automatica], [status]) INCLUDE ([agendada_para], [notificado_em]);
GO
