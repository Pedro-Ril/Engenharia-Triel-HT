/*
  =========================================================
  Portal Triel-HT — configuração do Active Directory no
  banco de dados
  =========================================================

  Move a configuração de conexão com o AD (antes só em
  variáveis de ambiente) para uma tabela editável pela tela
  de administração. É uma linha única (singleton, id
  sempre 1) — não é uma lista, é "a" configuração atual.

  A senha da conta de serviço nunca é gravada em texto
  puro: fica cifrada (AES-256-GCM, ver
  src/lib/crypto/segredo.ts) com uma chave que continua só
  no .env (AD_CONFIG_ENCRYPTION_KEY) — se o banco vazar
  sozinho, a senha do AD não vaza junto.

  As credenciais de conexão com o próprio SQL Server
  continuam no .env — não têm como sair de lá sem criar uma
  dependência circular (precisa delas justamente para
  conseguir ler esta tabela).

  Execução: manual, direto no SQL Server de destino.
  `sqlcmd -f i:65001 -i este-arquivo.sql`.
  =========================================================
*/

SET XACT_ABORT ON;

BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.portal_configuracao_ad', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_configuracao_ad (
    [id]                    INT             NOT NULL,
    [url]                   NVARCHAR(200)   NOT NULL,
    [base_dn]               NVARCHAR(300)   NOT NULL,
    [usuario_servico]       NVARCHAR(150)   NOT NULL,
    [senha_servico_cifrada] VARBINARY(512)  NOT NULL,
    [grupo_admin_dn]        NVARCHAR(300)   NOT NULL,
    [atualizado_em]         DATETIME2       NOT NULL
      CONSTRAINT [DF_portal_configuracao_ad_atualizado_em]
        DEFAULT SYSDATETIME(),
    [atualizado_por]        NVARCHAR(150)   NULL,

    CONSTRAINT [PK_portal_configuracao_ad]
      PRIMARY KEY ([id]),

    CONSTRAINT [CK_portal_configuracao_ad_singleton]
      CHECK ([id] = 1)
  );
END;
GO

COMMIT TRANSACTION;
