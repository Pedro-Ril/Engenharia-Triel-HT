/*
 * Terminal de Fábrica: nova opção de abertura do 3D, o 3D Navigate
 * (app ENXDISC_AP do 3DDashboard), que passa a ser o padrão.
 *
 * - O CHECK passa a aceitar '3d-navigate' e o DEFAULT vira '3d-navigate'.
 * - Aparelhos que estavam no padrão antigo ('3dplay') passam para o 3D
 *   Navigate. Quem foi trocado para 'product-explorer' fica como está.
 *
 * Ver src/lib/terminal-fabrica/visualizacao-3d.ts.
 */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF EXISTS (
  SELECT 1 FROM sys.check_constraints
  WHERE parent_object_id = OBJECT_ID(N'dbo.portal_tv_terminais')
    AND name = 'CK_portal_tv_terminais_visualizacao_3d'
    AND definition NOT LIKE '%3d-navigate%'
)
  ALTER TABLE dbo.portal_tv_terminais DROP CONSTRAINT CK_portal_tv_terminais_visualizacao_3d;

IF NOT EXISTS (
  SELECT 1 FROM sys.check_constraints
  WHERE parent_object_id = OBJECT_ID(N'dbo.portal_tv_terminais')
    AND name = 'CK_portal_tv_terminais_visualizacao_3d'
)
  ALTER TABLE dbo.portal_tv_terminais
    ADD CONSTRAINT CK_portal_tv_terminais_visualizacao_3d
      CHECK ([visualizacao_3d] IN ('3d-navigate', '3dplay', 'product-explorer'));

IF EXISTS (
  SELECT 1 FROM sys.default_constraints
  WHERE parent_object_id = OBJECT_ID(N'dbo.portal_tv_terminais')
    AND name = 'DF_portal_tv_terminais_visualizacao_3d'
    AND definition NOT LIKE '%3d-navigate%'
)
  ALTER TABLE dbo.portal_tv_terminais DROP CONSTRAINT DF_portal_tv_terminais_visualizacao_3d;

IF NOT EXISTS (
  SELECT 1 FROM sys.default_constraints
  WHERE parent_object_id = OBJECT_ID(N'dbo.portal_tv_terminais')
    AND name = 'DF_portal_tv_terminais_visualizacao_3d'
)
  ALTER TABLE dbo.portal_tv_terminais
    ADD CONSTRAINT DF_portal_tv_terminais_visualizacao_3d DEFAULT '3d-navigate' FOR [visualizacao_3d];

UPDATE dbo.portal_tv_terminais
SET [visualizacao_3d] = '3d-navigate', [atualizado_em] = SYSDATETIME()
WHERE [visualizacao_3d] = '3dplay';

COMMIT TRANSACTION;
