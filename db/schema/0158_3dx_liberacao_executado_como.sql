/*
 * Liberação de desenhos no 3DX em nome de quem pediu (não mais com o
 * admin): a API do 3DX abre uma sessão do próprio usuário e devolve com
 * que usuário o 3DX executou ("executadoComo"). Guardado na rodada para
 * auditoria. NULL nas simulações e nas liberações antigas (feitas com o admin).
 */
SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.portal_3dx_liberacoes') AND name = 'executado_como')
  ALTER TABLE dbo.portal_3dx_liberacoes ADD [executado_como] NVARCHAR(150) NULL;

COMMIT TRANSACTION;
GO
