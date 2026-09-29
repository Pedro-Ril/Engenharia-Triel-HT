SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- Como o Painel de Aprovações abre por padrão: uma linha por
-- COLABORADOR (fila de decisões, o comportamento original) ou uma linha
-- por SOLICITAÇÃO (o lote inteiro, decidido dentro do modal). O usuário
-- pode trocar na própria tela; isto define só com o que ela começa.
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.portal_aprovacoes_config') AND name = 'modo_painel_padrao'
)
BEGIN
  ALTER TABLE dbo.portal_aprovacoes_config
    ADD [modo_painel_padrao] VARCHAR(20) NOT NULL
    CONSTRAINT DF_portal_aprovacoes_config_modo DEFAULT 'colaborador';
END;

COMMIT TRANSACTION;
