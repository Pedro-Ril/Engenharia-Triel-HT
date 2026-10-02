SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- Preferência de tela, por usuário e por módulo (ex: quais colunas a
-- pessoa quer ver na Integração TuBest).
--
-- Genérica de propósito: portal_preferencias_usuario tem uma coluna por
-- preferência (hoje só [tema]), o que funciona para o punhado de
-- preferências globais do portal, mas obrigaria um ALTER TABLE a cada
-- módulo que quisesse guardar algo do usuário. Aqui a chave é livre e o
-- valor é JSON lido pelo próprio módulo -- o banco não precisa saber o
-- que cada módulo guarda.
IF OBJECT_ID(N'dbo.portal_preferencias_usuario_modulo', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_preferencias_usuario_modulo (
    [usuario_id] UNIQUEIDENTIFIER NOT NULL,
    [chave] VARCHAR(80) NOT NULL,
    [valor] NVARCHAR(MAX) NULL,
    [atualizado_em] DATETIME2 NOT NULL CONSTRAINT DF_pref_usuario_modulo_atualizado DEFAULT SYSDATETIME(),
    CONSTRAINT PK_portal_preferencias_usuario_modulo PRIMARY KEY ([usuario_id], [chave]),
    CONSTRAINT FK_portal_preferencias_usuario_modulo_usuario
      FOREIGN KEY ([usuario_id]) REFERENCES dbo.portal_usuarios([id])
  );
END;

COMMIT TRANSACTION;
