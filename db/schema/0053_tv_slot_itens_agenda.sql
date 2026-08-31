SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.portal_tv_slot_itens') AND name = 'dias_semana'
)
BEGIN
  ALTER TABLE dbo.portal_tv_slot_itens
    ADD [dias_semana] VARCHAR(20) NOT NULL CONSTRAINT DF_ptvsi_dias_semana DEFAULT 'todos';
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.portal_tv_slot_itens') AND name = 'hora_inicio'
)
BEGIN
  ALTER TABLE dbo.portal_tv_slot_itens
    ADD [hora_inicio] TIME NOT NULL CONSTRAINT DF_ptvsi_hora_inicio DEFAULT '00:00:00';
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.portal_tv_slot_itens') AND name = 'hora_fim'
)
BEGIN
  ALTER TABLE dbo.portal_tv_slot_itens
    ADD [hora_fim] TIME NOT NULL CONSTRAINT DF_ptvsi_hora_fim DEFAULT '23:59:59';
END;

COMMIT TRANSACTION;
