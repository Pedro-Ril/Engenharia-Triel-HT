/*
  =========================================================
  Portal Triel-HT — grupo de usuários do AD (para importação)
  =========================================================

  Adiciona portal_configuracao_ad.grupo_usuarios_dn — o DN do
  grupo do AD cujos membros podem ser importados manualmente
  para o portal antes do primeiro login (tela Usuários,
  botão "Importar do AD"). Separado do grupo_admin_dn, que
  já existia e serve só para calcular eh_administrador.

  Nullable porque instalações já existentes (linha única já
  criada em 0004) precisam continuar funcionando sem essa
  coluna preenchida — a importação só fica disponível depois
  que um admin configurar o grupo pela tela.

  Execução: manual, direto no SQL Server de destino, depois
  de 0004 já ter rodado.
  `sqlcmd -f i:65001 -i este-arquivo.sql`.
  =========================================================
*/

SET XACT_ABORT ON;

BEGIN TRANSACTION;

IF COL_LENGTH(N'dbo.portal_configuracao_ad', N'grupo_usuarios_dn') IS NULL
BEGIN
  ALTER TABLE dbo.portal_configuracao_ad
    ADD [grupo_usuarios_dn] NVARCHAR(300) NULL;
END;
GO

COMMIT TRANSACTION;
