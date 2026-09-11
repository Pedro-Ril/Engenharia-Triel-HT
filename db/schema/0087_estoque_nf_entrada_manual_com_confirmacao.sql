SET XACT_ABORT ON;
BEGIN TRANSACTION;

/*
 * NF de entrada deixa de ser preenchida só pela integração — o usuário
 * passa a poder digitar o número já na entrada. O job de integração
 * continua rodando por trás pra confirmar/achar o valor real no ERP;
 * "nf_entrada_confirmada_em" marca quando isso aconteceu, pra saber
 * quando parar de tentar (não dá mais pra usar "numero_nf_entrada IS
 * NULL" pra isso, já que agora ele pode estar preenchido só pelo que o
 * usuário digitou, sem a integração ter rodado ainda).
 */
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.com_estoque_equipamentos_usados') AND name = 'nf_entrada_confirmada_em'
)
BEGIN
  ALTER TABLE dbo.com_estoque_equipamentos_usados ADD nf_entrada_confirmada_em DATETIME2 NULL;
END;

COMMIT TRANSACTION;
GO

/*
 * Quem já tem NF de entrada preenchida antes desta mudança existir conta
 * como já confirmado — evita o job varrer a base inteira tentando
 * "confirmar" entradas antigas que já estão corretas.
 */
UPDATE dbo.com_estoque_equipamentos_usados
SET [nf_entrada_confirmada_em] = [atualizado_em]
WHERE [numero_nf_entrada] IS NOT NULL AND [nf_entrada_confirmada_em] IS NULL;

/*
 * O campo de sistema "NF de entrada" sai da categoria "vem de
 * integração" (que trava o input no formulário) em todos os tipos já
 * cadastrados — a partir de agora é digitável na entrada, como qualquer
 * outro campo do "Recebimento".
 */
UPDATE dbo.com_estoque_tipos_equipamento_campos
SET [vem_de_integracao] = 0
WHERE [chave] = N'sistemaNumeroNfEntrada';
