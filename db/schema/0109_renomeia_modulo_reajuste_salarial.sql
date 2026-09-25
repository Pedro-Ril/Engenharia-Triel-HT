SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- Renomeia o módulo "Solicitar Aumento Salarial" para "Reajuste Salarial" (nome exibido em Permissões, catálogo de módulos, etc.) -- chave/rota permanecem as mesmas, só o texto visível muda.
UPDATE dbo.portal_modulos
SET [nome] = N'Reajuste Salarial'
WHERE [chave] = 'aprovacoes-solicitar-aumento';

COMMIT TRANSACTION;
