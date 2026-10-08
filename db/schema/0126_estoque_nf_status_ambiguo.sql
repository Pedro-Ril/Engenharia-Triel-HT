/*
 * "ambiguo" passa a ser um status válido da integração de NF.
 *
 * O código decide por ele quando o ERP devolve mais de uma NF candidata
 * (ou mais páginas sem confirmação por CNPJ): nada é aplicado e as
 * candidatas vão na mensagem, para alguém escolher. A tela de detalhe do
 * equipamento já sabe mostrar esse status ("Precisa de conferência", em
 * amarelo) e o tipo em estoque.types.ts já o declara.
 *
 * Só a CHECK criada em 0081 ficou para trás, com três valores. Toda vez
 * que o caso acontecia, o INSERT era recusado, a exceção caia no catch
 * da própria função e era gravada uma segunda linha com status "erro" e
 * a mensagem do próprio erro de SQL -- perdendo quais eram as
 * candidatas. Foram 8.394 linhas assim, 70% da tabela, e o recurso
 * nunca chegou a funcionar uma vez sequer.
 */
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_com_estoque_nf_logs_status')
  ALTER TABLE dbo.com_estoque_integracao_nf_logs DROP CONSTRAINT CK_com_estoque_nf_logs_status;

ALTER TABLE dbo.com_estoque_integracao_nf_logs
  ADD CONSTRAINT CK_com_estoque_nf_logs_status
  CHECK ([status] IN (N'sucesso', N'nao_encontrado', N'erro', N'ambiguo'));

COMMIT TRANSACTION;
