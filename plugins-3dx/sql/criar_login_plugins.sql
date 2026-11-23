/*
 * Login SQL dos plugins do 3DSpace (triel-3dx-core) no banco do Portal.
 *
 * Rodar UMA vez, como sysadmin, na instância do Portal (pdmserver, banco PortalTrielHT), DEPOIS da
 * migração db/schema/0172_plugins_3dx.sql. Cole no SSMS e troque <SENHA_FORTE> na janela de consulta (sem
 * salvar o arquivo): a mesma senha vai em /App/triel/triel-plugins.properties nos servidores do 3DSpace.
 *
 * Permissões mínimas: só as tabelas dos plugins e, de portal_usuarios, apenas id e sam_account_name
 * (para ligar o login do 3DX ao usuário do Portal).
 */
USE [master];
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'triel_3dx_plugins')
  CREATE LOGIN [triel_3dx_plugins] WITH PASSWORD = N'<SENHA_FORTE>', DEFAULT_DATABASE = [PortalTrielHT],
    CHECK_POLICY = ON, CHECK_EXPIRATION = OFF;
GO

USE [PortalTrielHT];
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'triel_3dx_plugins')
  CREATE USER [triel_3dx_plugins] FOR LOGIN [triel_3dx_plugins];
GO

GRANT SELECT ON dbo.portal_3dx_plugins TO [triel_3dx_plugins];
/* depois da migração 0174 (notas de versão gravadas pelo próprio jar) */
IF OBJECT_ID(N'dbo.portal_3dx_plugins_versoes', N'U') IS NOT NULL
  GRANT SELECT, INSERT ON dbo.portal_3dx_plugins_versoes TO [triel_3dx_plugins];
/* depois da migração 0173 (modo/parâmetros por ambiente) */
IF OBJECT_ID(N'dbo.portal_3dx_plugins_ambientes', N'U') IS NOT NULL
  GRANT SELECT ON dbo.portal_3dx_plugins_ambientes TO [triel_3dx_plugins];
GRANT SELECT, INSERT, UPDATE ON dbo.portal_3dx_plugins_execucoes TO [triel_3dx_plugins];
GRANT SELECT, INSERT, UPDATE ON dbo.portal_3dx_plugins_nos TO [triel_3dx_plugins];
GRANT INSERT ON dbo.portal_3dx_plugins_itens TO [triel_3dx_plugins];
GRANT INSERT ON dbo.portal_3dx_plugins_eventos TO [triel_3dx_plugins];
GRANT SELECT ([id], [sam_account_name]) ON dbo.portal_usuarios TO [triel_3dx_plugins];
GO

/* Conferência: deve listar só as permissões acima. */
SELECT OBJECT_NAME(p.major_id) AS tabela, COL_NAME(p.major_id, p.minor_id) AS coluna, p.permission_name
FROM sys.database_permissions p
JOIN sys.database_principals u ON u.principal_id = p.grantee_principal_id
WHERE u.name = N'triel_3dx_plugins' AND p.class = 1
ORDER BY tabela, permission_name, coluna;
GO
