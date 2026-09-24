SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- Última vez que cada usuário viu cada chamado -- usado só para sinalizar
-- "tem interação nova que não foi minha" na fila de atendimento (ver
-- listarFilaAtendimento em src/lib/chamados/chamados.ts), sem precisar abrir
-- o chamado pra descobrir. Uma linha por (chamado, usuário), sempre
-- atualizada (nunca inserida de novo) a cada vez que o usuário abre o
-- chamado -- ver registrarVisualizacaoChamadoSemFalhar.
IF OBJECT_ID(N'dbo.portal_chamados_visualizacoes', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_chamados_visualizacoes (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_chamados_visualizacoes_id DEFAULT NEWID() PRIMARY KEY,
    [chamado_id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_chamados_visualizacoes_chamado REFERENCES dbo.portal_chamados([id]) ON DELETE CASCADE,
    [usuario_id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_chamados_visualizacoes_usuario REFERENCES dbo.portal_usuarios([id]) ON DELETE CASCADE,
    [visualizado_em] DATETIME2 NOT NULL CONSTRAINT DF_chamados_visualizacoes_visualizado_em DEFAULT SYSDATETIME(),
    CONSTRAINT UQ_chamados_visualizacoes UNIQUE ([chamado_id], [usuario_id])
  );
END;

COMMIT TRANSACTION;
