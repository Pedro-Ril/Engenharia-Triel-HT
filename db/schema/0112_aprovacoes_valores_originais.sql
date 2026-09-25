SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- A direção pode ajustar o valor/percentual do reajuste antes de
-- decidir. Quando isso acontece, o que o SOLICITANTE pediu é copiado
-- para estas colunas antes de sobrescrever as originais -- NULL quer
-- dizer "a direção não mexeu", então não precisa comparar decimal com
-- decimal pra saber se houve alteração, e o caminho de criação não
-- muda em nada.
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.portal_aprovacoes_aumento_salarial')
    AND name = 'valor_reajuste_original'
)
BEGIN
  ALTER TABLE dbo.portal_aprovacoes_aumento_salarial
    ADD [valor_reajuste_original] DECIMAL(14,2) NULL;
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.portal_aprovacoes_aumento_salarial')
    AND name = 'percentual_reajuste_original'
)
BEGIN
  ALTER TABLE dbo.portal_aprovacoes_aumento_salarial
    ADD [percentual_reajuste_original] DECIMAL(9,4) NULL;
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.portal_aprovacoes_aumento_salarial')
    AND name = 'novo_salario_original'
)
BEGIN
  ALTER TABLE dbo.portal_aprovacoes_aumento_salarial
    ADD [novo_salario_original] DECIMAL(14,2) NULL;
END;

COMMIT TRANSACTION;
