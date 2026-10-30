/*
 * Engenharia Versátil: ajuste de peso do item no ERP (peso divergente).
 * O registro de cada item passa a guardar o peso gravado (peso_novo) e o
 * bruto antes/depois; peso_erp continua sendo o peso de antes. A ação
 * nova é "peso_e_fator" (peso + fator KG na mesma transação do ERP).
 */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.eng_versatil_fatores_itens') AND name = 'peso_novo')
  ALTER TABLE dbo.eng_versatil_fatores_itens ADD [peso_novo] DECIMAL(18, 6) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.eng_versatil_fatores_itens') AND name = 'peso_brt_antes')
  ALTER TABLE dbo.eng_versatil_fatores_itens ADD [peso_brt_antes] DECIMAL(18, 6) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.eng_versatil_fatores_itens') AND name = 'peso_brt_novo')
  ALTER TABLE dbo.eng_versatil_fatores_itens ADD [peso_brt_novo] DECIMAL(18, 6) NULL;

COMMIT TRANSACTION;
