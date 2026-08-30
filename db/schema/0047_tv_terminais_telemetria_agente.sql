SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.portal_tv_terminais') AND name = 'agente_ip'
)
BEGIN
  ALTER TABLE dbo.portal_tv_terminais
    ADD [agente_ip] NVARCHAR(45) NULL;
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.portal_tv_terminais') AND name = 'agente_cpu_percentual'
)
BEGIN
  ALTER TABLE dbo.portal_tv_terminais
    ADD [agente_cpu_percentual] FLOAT NULL;
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.portal_tv_terminais') AND name = 'agente_memoria_percentual'
)
BEGIN
  ALTER TABLE dbo.portal_tv_terminais
    ADD [agente_memoria_percentual] FLOAT NULL;
END;

COMMIT TRANSACTION;
