/*
 * Pedidos de compra: mais campos da foto do ERP, para a lista do painel
 * mostrar o que importa na decisão sem consultar o ERP linha a linha.
 *
 * - quantidade_itens: quantas linhas o pedido tem.
 * - condicao_pagamento: resumo das parcelas ("30/60 dias", "À vista").
 * - entrega_prevista: a primeira data de entrega entre os itens.
 */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.portal_aprovacoes_pedido_compra') AND name = 'quantidade_itens')
  ALTER TABLE dbo.portal_aprovacoes_pedido_compra ADD [quantidade_itens] INT NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.portal_aprovacoes_pedido_compra') AND name = 'condicao_pagamento')
  ALTER TABLE dbo.portal_aprovacoes_pedido_compra ADD [condicao_pagamento] NVARCHAR(120) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.portal_aprovacoes_pedido_compra') AND name = 'entrega_prevista')
  ALTER TABLE dbo.portal_aprovacoes_pedido_compra ADD [entrega_prevista] DATE NULL;

COMMIT TRANSACTION;
