/*
 * Pedidos de compra: foto do pedido no ERP no momento do envio.
 *
 * O detalhe completo (itens, parcelas, impostos) o painel busca ao vivo
 * no Focco. Aqui fica só o que a lista precisa e o que serve para
 * comparar depois: se o valor total ou a situação mudaram desde que o
 * comprador mandou, o diretor é avisado no detalhe -- ele aprova o que
 * foi enviado, não uma versão alterada sem saber.
 *
 * Tudo NULL quando o ERP não respondeu no envio (o pedido entra mesmo
 * assim) e nos envios anteriores a esta migração.
 */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.portal_aprovacoes_pedido_compra') AND name = 'fornecedor_codigo')
  ALTER TABLE dbo.portal_aprovacoes_pedido_compra ADD [fornecedor_codigo] INT NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.portal_aprovacoes_pedido_compra') AND name = 'fornecedor_nome')
  ALTER TABLE dbo.portal_aprovacoes_pedido_compra ADD [fornecedor_nome] NVARCHAR(200) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.portal_aprovacoes_pedido_compra') AND name = 'comprador_nome')
  ALTER TABLE dbo.portal_aprovacoes_pedido_compra ADD [comprador_nome] NVARCHAR(200) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.portal_aprovacoes_pedido_compra') AND name = 'data_emissao')
  ALTER TABLE dbo.portal_aprovacoes_pedido_compra ADD [data_emissao] DATE NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.portal_aprovacoes_pedido_compra') AND name = 'valor_total')
  ALTER TABLE dbo.portal_aprovacoes_pedido_compra ADD [valor_total] DECIMAL(18, 2) NULL;

/* Código/descrição da moeda quando não é real (ex.: pedido em euro). */
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.portal_aprovacoes_pedido_compra') AND name = 'moeda')
  ALTER TABLE dbo.portal_aprovacoes_pedido_compra ADD [moeda] NVARCHAR(60) NULL;

/* pendente | parcial | atendido | cancelado, como o ERP devolveu. */
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.portal_aprovacoes_pedido_compra') AND name = 'situacao_erp')
  ALTER TABLE dbo.portal_aprovacoes_pedido_compra ADD [situacao_erp] VARCHAR(20) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.portal_aprovacoes_pedido_compra') AND name = 'snapshot_em')
  ALTER TABLE dbo.portal_aprovacoes_pedido_compra ADD [snapshot_em] DATETIME2 NULL;

COMMIT TRANSACTION;
