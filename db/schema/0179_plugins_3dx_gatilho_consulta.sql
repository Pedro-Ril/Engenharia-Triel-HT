/*
 * Plugins 3DX: gatilho "consulta" nas execuções -- o plugin maturity-state (estado de maturidade pelo banco)
 * grava uma execução quando a busca ou a estrutura que o integrador do SOLIDWORKS lê traz objeto com o estado do
 * índice diferente do banco (um item por objeto divergente).
 */
SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_portal_3dx_plugins_exec_gatilho'
           AND definition NOT LIKE '%consulta%')
BEGIN
  ALTER TABLE dbo.portal_3dx_plugins_execucoes DROP CONSTRAINT CK_portal_3dx_plugins_exec_gatilho;
  ALTER TABLE dbo.portal_3dx_plugins_execucoes ADD CONSTRAINT CK_portal_3dx_plugins_exec_gatilho
    CHECK ([gatilho] IN ('liberacao', 'duplicacao', 'noturna', 'manual', 'consulta'));
END;

COMMIT TRANSACTION;
GO
