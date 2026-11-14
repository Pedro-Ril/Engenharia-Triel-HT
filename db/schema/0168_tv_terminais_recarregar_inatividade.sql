/*
 * TV Corporativa: recarregar a página quando o terminal fica parado.
 *
 * recarregar_inatividade = 1 -> se o terminal ficar `inatividade_segundos`
 * sem nenhuma entrada (mouse, teclado, rolagem, toque, acesso remoto), o
 * agente do terminal reabre o navegador. Uma vez por período
 * parado: só volta a contar depois que alguém mexer de novo. Ver
 * tv-agente/agente.mjs, iniciarMonitorInatividade.
 *
 * Padrão desligado e 60 s: nada muda nos terminais que já existem.
 */
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.portal_tv_terminais') AND name = 'recarregar_inatividade'
)
BEGIN
  ALTER TABLE dbo.portal_tv_terminais
    ADD [recarregar_inatividade] BIT NOT NULL
      CONSTRAINT DF_portal_tv_terminais_recarregar_inatividade DEFAULT 0;
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.portal_tv_terminais') AND name = 'inatividade_segundos'
)
BEGIN
  ALTER TABLE dbo.portal_tv_terminais
    ADD [inatividade_segundos] INT NOT NULL
      CONSTRAINT DF_portal_tv_terminais_inatividade_segundos DEFAULT 60
      CONSTRAINT CK_portal_tv_terminais_inatividade_segundos CHECK ([inatividade_segundos] BETWEEN 10 AND 86400);
END;

COMMIT TRANSACTION;
