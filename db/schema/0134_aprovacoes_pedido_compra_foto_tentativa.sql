/*
 * Pedidos de compra: quando o painel tentou completar a foto do ERP pela
 * última vez sem conseguir (pedido não encontrado ou ERP fora do ar).
 *
 * Sem isso, cada abertura da lista consultava o ERP de novo para os
 * mesmos pedidos sem foto. Com isso, a nova tentativa espera um
 * intervalo (ver completarFotosFaltantes em pedidos-compra.ts).
 */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.portal_aprovacoes_pedido_compra') AND name = 'foto_tentativa_em')
  ALTER TABLE dbo.portal_aprovacoes_pedido_compra ADD [foto_tentativa_em] DATETIME2 NULL;

COMMIT TRANSACTION;
