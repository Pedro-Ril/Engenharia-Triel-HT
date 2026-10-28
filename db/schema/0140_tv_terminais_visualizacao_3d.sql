/*
 * Terminal de Fábrica: em qual app o botão 3D abre, por aparelho da TV
 * Corporativa (Administração → Terminal de Fábrica → Visualização).
 *
 * '3dplay' (padrão, como sempre foi) ou 'product-explorer' (Product
 * Explorer ao lado do 3D Navigate). O aparelho recebe a escolha na URL
 * da página do terminal, quando busca a grade (ver /api/tv/grade-atual).
 */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.portal_tv_terminais') AND name = 'visualizacao_3d')
  ALTER TABLE dbo.portal_tv_terminais ADD [visualizacao_3d] VARCHAR(20) NOT NULL
    CONSTRAINT DF_portal_tv_terminais_visualizacao_3d DEFAULT '3dplay'
    CONSTRAINT CK_portal_tv_terminais_visualizacao_3d CHECK ([visualizacao_3d] IN ('3dplay', 'product-explorer'));

COMMIT TRANSACTION;
