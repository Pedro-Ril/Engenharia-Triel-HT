/*
 * Plugins 3DX: notas de cada versão (o que mudou), gravadas pelo próprio jar.
 *
 * O núcleo (triel-3dx-core) e cada plugin carregam no código o histórico das suas versões. Ao subir, o nó grava
 * aqui as que ainda não existem -- a nota sempre corresponde ao jar instalado e ninguém precisa cadastrar à mão.
 * Uma versão já registrada não é alterada (o primeiro nó que subiu com ela é quem registra).
 *
 * componente: 'core' (núcleo) ou a chave do plugin em portal_3dx_plugins (sem FK: 'core' não é plugin).
 *
 * Aplicar com: sqlcmd -S pdmserver -U sa -d PortalTrielHT -C -f 65001 -i db/schema/0174_plugins_3dx_versoes.sql
 */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.portal_3dx_plugins_versoes', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_3dx_plugins_versoes (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_portal_3dx_plugins_versoes_id DEFAULT NEWID()
      CONSTRAINT PK_portal_3dx_plugins_versoes PRIMARY KEY,
    [componente] VARCHAR(40) NOT NULL,
    [versao] VARCHAR(40) NOT NULL,
    /* data da versão declarada no código (quando foi feita), não da instalação */
    [lancada_em] DATE NULL,
    [notas] NVARCHAR(2000) NOT NULL,
    /* quem registrou: o primeiro nó que subiu com esta versão, e quando */
    [registrado_no] VARCHAR(200) NULL,
    [registrado_ambiente] VARCHAR(10) NULL,
    [registrado_em] DATETIME2 NOT NULL CONSTRAINT DF_portal_3dx_plugins_versoes_registrado DEFAULT SYSDATETIME(),
    CONSTRAINT UQ_portal_3dx_plugins_versoes UNIQUE ([componente], [versao])
  );
END;

IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'triel_3dx_plugins')
  GRANT SELECT, INSERT ON dbo.portal_3dx_plugins_versoes TO [triel_3dx_plugins];

COMMIT TRANSACTION;
GO

SELECT COUNT(*) AS [versoes_registradas] FROM dbo.portal_3dx_plugins_versoes;
GO
