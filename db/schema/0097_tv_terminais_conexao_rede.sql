SET XACT_ABORT ON;
BEGIN TRANSACTION;

/*
 * Reportado pelo agente nativo Linux a cada verificação periódica (ver
 * registrarVerificacaoAgenteSemFalhar) -- "cabeada"/"wifi"/"desconectado".
 * NULL = terminal Windows, ou Linux ainda rodando um agente sem essa
 * verificação (versão antiga, antes de se autoatualizar).
 */
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.portal_tv_terminais') AND name = 'agente_tipo_conexao'
)
BEGIN
  ALTER TABLE dbo.portal_tv_terminais ADD [agente_tipo_conexao] VARCHAR(20) NULL;
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.portal_tv_terminais') AND name = 'agente_wifi_ssid'
)
BEGIN
  ALTER TABLE dbo.portal_tv_terminais ADD [agente_wifi_ssid] NVARCHAR(64) NULL;
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.portal_tv_terminais') AND name = 'agente_wifi_intensidade'
)
BEGIN
  ALTER TABLE dbo.portal_tv_terminais ADD [agente_wifi_intensidade] INT NULL;
END;

COMMIT TRANSACTION;
