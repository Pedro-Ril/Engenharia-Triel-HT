SET XACT_ABORT ON;
BEGIN TRANSACTION;

/*
 * Só o hash do token (token_hash) fica permanente — mas o terminal
 * (via polling, antes de guardar o token de forma durável) precisa
 * receber o valor em claro pelo menos uma vez depois que o admin
 * confirma o pareamento. Este campo guarda esse valor só até a
 * primeira leitura bem-sucedida do terminal, que o apaga em seguida
 * (ver src/lib/tv/terminais.ts) — nunca é uma cópia permanente do
 * token, é só a "caixa de entrega" de uma única mensagem.
 */
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.portal_tv_terminais') AND name = 'token_pendente_entrega'
)
BEGIN
  ALTER TABLE dbo.portal_tv_terminais
    ADD [token_pendente_entrega] NVARCHAR(1000) NULL;
END;

COMMIT TRANSACTION;
