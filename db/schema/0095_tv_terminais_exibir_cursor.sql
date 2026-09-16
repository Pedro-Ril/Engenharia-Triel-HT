SET XACT_ABORT ON;
BEGIN TRANSACTION;

/*
 * Por padrão (0) o terminal roda como TV passiva de sinalização,
 * sem cursor -- alguns terminais (ex: TLT01) têm mouse de verdade e
 * são operados por alguém, então precisam do cursor sempre visível
 * (ver tv-agente/agente.mjs, iniciarNudgeCursor).
 */
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.portal_tv_terminais') AND name = 'exibir_cursor'
)
BEGIN
  ALTER TABLE dbo.portal_tv_terminais
    ADD [exibir_cursor] BIT NOT NULL CONSTRAINT DF_tv_terminais_exibir_cursor DEFAULT 0;
END;

COMMIT TRANSACTION;
