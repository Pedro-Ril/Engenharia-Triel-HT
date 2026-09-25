SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- Além da observação geral do lote (portal_aprovacoes.observacao,
-- compartilhada por todos os colaboradores), cada colaborador pode ter
-- sua própria observação individual -- ex: "esse aqui é promoção",
-- "ajuste de mercado", específico daquela pessoa.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.portal_aprovacoes_aumento_salarial') AND name = 'observacao')
BEGIN
  ALTER TABLE dbo.portal_aprovacoes_aumento_salarial ADD [observacao] NVARCHAR(2000) NULL;
END;

COMMIT TRANSACTION;
