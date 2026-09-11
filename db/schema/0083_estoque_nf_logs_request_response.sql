SET XACT_ABORT ON;
BEGIN TRANSACTION;

/*
 * Guarda a requisição/resposta crua de cada tentativa — usado pelo modal
 * "Tentativas de integração" (clicar na badge de status abre o detalhe
 * completo, útil pra depurar por que o ERP não achou ou devolveu erro).
 */
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.com_estoque_integracao_nf_logs') AND name = 'request_url'
)
BEGIN
  ALTER TABLE dbo.com_estoque_integracao_nf_logs ADD [request_url] NVARCHAR(500) NULL;
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.com_estoque_integracao_nf_logs') AND name = 'response_status'
)
BEGIN
  ALTER TABLE dbo.com_estoque_integracao_nf_logs ADD [response_status] INT NULL;
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.com_estoque_integracao_nf_logs') AND name = 'response_body'
)
BEGIN
  ALTER TABLE dbo.com_estoque_integracao_nf_logs ADD [response_body] NVARCHAR(MAX) NULL;
END;

COMMIT TRANSACTION;
