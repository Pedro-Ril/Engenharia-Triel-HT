/*
 * Pedidos de compra: o SupriConnect pode mandar o pedido para um
 * diretor específico. Fica por pedido (não no lote) porque a decisão é
 * por pedido; o nome é foto do momento do envio, como o resto do
 * módulo. NULL = qualquer aprovador de pedidos de compra decide.
 */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.portal_aprovacoes_pedido_compra') AND name = 'aprovador_usuario_id')
  ALTER TABLE dbo.portal_aprovacoes_pedido_compra ADD [aprovador_usuario_id] UNIQUEIDENTIFIER NULL
    CONSTRAINT FK_portal_aprov_pedido_compra_aprovador REFERENCES dbo.portal_usuarios([id]);

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.portal_aprovacoes_pedido_compra') AND name = 'aprovador_nome')
  ALTER TABLE dbo.portal_aprovacoes_pedido_compra ADD [aprovador_nome] NVARCHAR(200) NULL;

COMMIT TRANSACTION;
GO

/* Consulta de decisões do legado: "o que foi decidido desde a última vez". */
SET QUOTED_IDENTIFIER ON;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.portal_aprovacoes_pedido_compra') AND name = 'IX_portal_aprov_pedido_compra_decidido_em')
  CREATE INDEX IX_portal_aprov_pedido_compra_decidido_em
    ON dbo.portal_aprovacoes_pedido_compra ([decidido_em])
    WHERE [decidido_em] IS NOT NULL;
