SET XACT_ABORT ON;
BEGIN TRANSACTION;

/*
 * Quando o chamado ENTROU no status atual "aguardando_confirmacao" --
 * NULL fora desse status. Guardado à parte de atualizado_em de
 * propósito: adicionarMensagem também bate atualizado_em a cada
 * mensagem nova, mesmo sem trocar de status, o que tornaria um prazo
 * baseado nele sujeito a reset por qualquer troca de mensagem. Serve de
 * base pro agendador de auto-resolução calcular o vencimento (ver
 * src/lib/chamados/scheduler.ts).
 */
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.portal_chamados') AND name = 'aguardando_confirmacao_em'
)
BEGIN
  ALTER TABLE dbo.portal_chamados ADD [aguardando_confirmacao_em] DATETIME2 NULL;
END;

/* NULL = recurso desligado (nenhum chamado fecha sozinho). Configurável em Administração -> Chamados. */
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.portal_chamados_config') AND name = 'dias_auto_resolucao'
)
BEGIN
  ALTER TABLE dbo.portal_chamados_config ADD [dias_auto_resolucao] INT NULL;
END;

COMMIT TRANSACTION;
