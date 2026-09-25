SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- Revertendo 0110: nenhum módulo do centro de aprovações deve ser
-- aberto por "estar autenticado" -- todo acesso (inclusive ver as
-- próprias solicitações) passa a depender de permissão concedida
-- explicitamente, igual aos outros dois módulos do grupo.
UPDATE dbo.portal_modulos
SET [publico_autenticado] = 0
WHERE [chave] = 'aprovacoes-minhas-solicitacoes';

COMMIT TRANSACTION;
