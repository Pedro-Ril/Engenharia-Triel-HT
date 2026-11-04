/*
 * Equipamentos Usados: ajuste manual de status pelo administrador.
 *
 * O status segue o ERP; uma movimentação manual comum só segura o status
 * por alguns dias, esperando a NF aparecer no ERP. O ajuste manual é para
 * quando o ERP está errado (lançamento por engano): vale até o ERP ter um
 * movimento mais novo que ele. A marca fica na própria movimentação.
 *
 * Já marca a baixa do #829 lançada direto no banco em 04/11/2026 (o ERP
 * tinha uma reclassificação por engano).
 */
SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.com_estoque_equipamentos_usados_movimentacoes') AND name = 'ajuste_manual')
  ALTER TABLE dbo.com_estoque_equipamentos_usados_movimentacoes ADD
    [ajuste_manual] BIT NOT NULL CONSTRAINT DF_com_estoque_mov_ajuste_manual DEFAULT 0;

COMMIT TRANSACTION;
GO

UPDATE dbo.com_estoque_equipamentos_usados_movimentacoes
SET [ajuste_manual] = 1
WHERE [id] = '9B13942D-0E6A-4757-93EC-CD0966CD5B35' AND [tipo_acao] = 'baixa' AND [origem] = 'portal';
GO
