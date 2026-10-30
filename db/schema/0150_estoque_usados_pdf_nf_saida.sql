/*
 * Equipamentos Usados: PDF das NFs de saída anexado automaticamente.
 *
 * As NFs que a empresa emite ficam salvas em PDF numa pasta de rede (uma
 * subpasta por ano e mês, arquivo "NF {número} - {cliente}...PDF"). Quando
 * o extrato do ERP traz uma SAÍDA nossa (remessa de empréstimo,
 * consignação, reforma, venda), a sincronização procura o PDF lá e anexa à
 * movimentação do extrato do Portal.
 *
 * - Anexo da integração não tem usuário: criado_por_usuario_id passa a aceitar NULL.
 * - Cópia do extrato do ERP: qual anexo saiu do PDF e quando ele foi procurado
 *   (não achou = tenta de novo no dia seguinte, não a cada hora).
 * - Config: a pasta dos PDFs e a empresa do ERP a que ela se refere (Matriz = 2).
 */
SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.com_estoque_movimentacoes_anexos') AND name = 'criado_por_usuario_id' AND is_nullable = 0
)
  ALTER TABLE dbo.com_estoque_movimentacoes_anexos ALTER COLUMN [criado_por_usuario_id] UNIQUEIDENTIFIER NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.com_estoque_equipamentos_usados_erp_movimentos') AND name = 'nf_pdf_anexo_id')
  ALTER TABLE dbo.com_estoque_equipamentos_usados_erp_movimentos ADD
    [nf_pdf_anexo_id] UNIQUEIDENTIFIER NULL,
    [nf_pdf_arquivo] NVARCHAR(400) NULL,
    [nf_pdf_procurado_em] DATETIME2 NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.com_estoque_equipamentos_usados_config') AND name = 'pasta_pdf_nf_saida')
  ALTER TABLE dbo.com_estoque_equipamentos_usados_config ADD
    [pasta_pdf_nf_saida] NVARCHAR(400) NULL,
    [cod_emp_pdf_nf_saida] INT NULL;

COMMIT TRANSACTION;
GO

/* Pasta informada pelo Pedro (30/10/2026): NFs da Matriz (empresa 2 no ERP). Só preenche se ainda estiver vazia. */
UPDATE dbo.com_estoque_equipamentos_usados_config
SET [pasta_pdf_nf_saida] = N'\\SERVIDORGERAL\Triel\Financeiro\publico\NFE\Matriz',
    [cod_emp_pdf_nf_saida] = 2
WHERE [id] = 1 AND [pasta_pdf_nf_saida] IS NULL;
