SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- Restrição opcional por usuário sobre QUAIS colaboradores ele pode
-- ver/buscar na tela de "Solicitar Aumento Salarial" (não afeta quem
-- decide no painel -- só quem cria a solicitação). Uma única tabela
-- com "tipo" discriminando a regra, em vez de 3 tabelas separadas:
--   'unidade_permitida'    -- allowlist: só aparece se o usuário tiver
--                             pelo menos uma linha desse tipo E o
--                             departamento do colaborador bater com uma
--                             delas. Usuário SEM nenhuma linha desse
--                             tipo não tem essa restrição (vê qualquer
--                             unidade).
--   'setor_excluido'       -- blocklist: nunca aparece um colaborador
--                             desse setor, mesmo que a unidade bata.
--   'colaborador_excluido' -- blocklist: nunca aparece esse colaborador
--                             específico (por código), mesmo que
--                             unidade/setor batam.
IF OBJECT_ID(N'dbo.portal_aprovacoes_escopo', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_aprovacoes_escopo (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_portal_aprov_escopo_id DEFAULT NEWID() PRIMARY KEY,
    [usuario_id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_portal_aprov_escopo_usuario REFERENCES dbo.portal_usuarios([id]),
    [tipo] VARCHAR(30) NOT NULL,
    [valor] NVARCHAR(200) NOT NULL,
    [valor_rotulo] NVARCHAR(200) NULL,
    [criado_em] DATETIME2 NOT NULL CONSTRAINT DF_portal_aprov_escopo_criado_em DEFAULT SYSDATETIME(),
    CONSTRAINT UQ_portal_aprov_escopo UNIQUE ([usuario_id], [tipo], [valor])
  );

  CREATE INDEX IX_portal_aprov_escopo_usuario ON dbo.portal_aprovacoes_escopo([usuario_id]);
END;

COMMIT TRANSACTION;
