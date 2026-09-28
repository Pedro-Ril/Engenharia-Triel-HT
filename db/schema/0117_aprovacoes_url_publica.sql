SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- Mesmo problema já resolvido em Chamados e Transferência de Arquivos:
-- atrás do proxy reverso que não repassa o Host original, request.url
-- vira "http://localhost:3000" e o link do e-mail sai inutilizável fora
-- do servidor. Configurar a URL pública resolve sem depender de
-- cabeçalho nenhum do proxy.
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.portal_aprovacoes_config') AND name = 'url_publica'
)
BEGIN
  ALTER TABLE dbo.portal_aprovacoes_config ADD [url_publica] NVARCHAR(300) NULL;
END;

COMMIT TRANSACTION;
