SET XACT_ABORT ON;
BEGIN TRANSACTION;

/*
 * FK_chamados_copia_chamado nasceu sem ON DELETE CASCADE (migração
 * 0092), ao contrário de FK_portal_chamados_mensagens_chamado e
 * FK_portal_chamados_tentativas_nome_chamado -- quebrava a exclusão
 * de qualquer chamado que tivesse alguém em cópia ("The DELETE
 * statement conflicted with the REFERENCE constraint").
 */
IF EXISTS (
  SELECT 1 FROM sys.foreign_keys
  WHERE name = 'FK_chamados_copia_chamado' AND delete_referential_action <> 1
)
BEGIN
  ALTER TABLE dbo.portal_chamados_copia DROP CONSTRAINT FK_chamados_copia_chamado;

  ALTER TABLE dbo.portal_chamados_copia
    ADD CONSTRAINT FK_chamados_copia_chamado
    FOREIGN KEY ([chamado_id]) REFERENCES dbo.portal_chamados([id]) ON DELETE CASCADE;
END;

COMMIT TRANSACTION;
