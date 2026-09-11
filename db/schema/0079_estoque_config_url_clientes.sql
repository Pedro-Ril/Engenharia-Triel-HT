SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.com_estoque_equipamentos_usados_config') AND name = 'url_clientes'
)
BEGIN
  ALTER TABLE dbo.com_estoque_equipamentos_usados_config ADD [url_clientes] NVARCHAR(300) NULL;
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.com_estoque_equipamentos_usados_config') AND name = 'url_clientes_teste'
)
BEGIN
  ALTER TABLE dbo.com_estoque_equipamentos_usados_config ADD [url_clientes_teste] NVARCHAR(300) NULL;
END;

COMMIT TRANSACTION;
GO

SET XACT_ABORT ON;
BEGIN TRANSACTION;

/*
 * Semeia a linha de config (id=1) com a URL que hoje está hardcoded em
 * estoque.service.ts (buscarClientesEstoque) — preserva o comportamento
 * atual (o dropdown de Cliente continua funcionando sem exigir que o
 * admin configure nada antes), só que agora editável pelo painel
 * Administração → Equipamentos Usados → Integração ERP.
 */
IF NOT EXISTS (SELECT 1 FROM dbo.com_estoque_equipamentos_usados_config WHERE [id] = 1)
BEGIN
  INSERT INTO dbo.com_estoque_equipamentos_usados_config ([id], [url_clientes])
  VALUES (1, N'http://192.168.0.250:3100/api/clientes');
END
ELSE
BEGIN
  UPDATE dbo.com_estoque_equipamentos_usados_config
  SET [url_clientes] = N'http://192.168.0.250:3100/api/clientes'
  WHERE [id] = 1 AND [url_clientes] IS NULL;
END;

COMMIT TRANSACTION;
