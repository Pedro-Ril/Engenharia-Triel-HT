SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- "Minhas Solicitações" foi desenhado desde o início pra ser aberto a
-- qualquer usuário autenticado (não precisa de permissão individual
-- pra ver as próprias solicitações) -- publico_autenticado estava
-- incorretamente em 0, provavelmente nunca aplicado de fato. Corrige
-- pra refletir o desenho original.
UPDATE dbo.portal_modulos
SET [publico_autenticado] = 1
WHERE [chave] = 'aprovacoes-minhas-solicitacoes';

COMMIT TRANSACTION;
