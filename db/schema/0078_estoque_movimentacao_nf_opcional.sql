SET XACT_ABORT ON;
BEGIN TRANSACTION;

/*
 * A movimentação "entrada" (criada automaticamente por criarEquipamento)
 * agora pode ter NF em branco, já que numero_nf_entrada deixou de ser
 * sempre obrigatório (migração 0077). numero_nf continua exigido pela
 * validação de cada rota (empréstimo/consignação/retorno/baixa ainda
 * chamam requiredText) — só a coluna em si passa a aceitar NULL, pra não
 * quebrar a inserção da entrada sem nota.
 */
IF EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'com_estoque_equipamentos_usados_movimentacoes' AND COLUMN_NAME = 'numero_nf' AND IS_NULLABLE = 'NO'
)
BEGIN
  ALTER TABLE dbo.com_estoque_equipamentos_usados_movimentacoes ALTER COLUMN [numero_nf] NVARCHAR(30) NULL;
END;

COMMIT TRANSACTION;
