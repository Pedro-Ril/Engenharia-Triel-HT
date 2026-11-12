/*
 * Mensagens de chamado com texto formatado (prints colados no meio do
 * texto, tabelas coladas do Excel). `formato` separa as mensagens:
 *   - 'texto': texto puro, como sempre foi (todas as mensagens antigas
 *     e as de sistema) -- exibido com quebras de linha preservadas;
 *   - 'html':  HTML já limpo pelo servidor (ver
 *     src/lib/chamados/mensagem-html.ts) antes de gravar.
 */
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.portal_chamados_mensagens') AND name = 'formato'
)
BEGIN
  ALTER TABLE dbo.portal_chamados_mensagens
    ADD [formato] VARCHAR(10) NOT NULL
      CONSTRAINT DF_portal_chamados_mensagens_formato DEFAULT 'texto';
END;

COMMIT TRANSACTION;

IF NOT EXISTS (
  SELECT 1 FROM sys.check_constraints
  WHERE name = 'CK_portal_chamados_mensagens_formato'
)
BEGIN
  EXEC(N'ALTER TABLE dbo.portal_chamados_mensagens
    ADD CONSTRAINT CK_portal_chamados_mensagens_formato CHECK ([formato] IN (''texto'', ''html''));');
END;
