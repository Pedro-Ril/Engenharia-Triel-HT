/*
 * Alçadas: direcionamento do próximo nível.
 *
 * Quem aprova um nível pode direcionar o próximo para UMA pessoa daquele
 * nível (ex.: a Gerência manda o pedido da Usitec para o Airton), ou
 * deixar para todos do nível. Direcionada, a etapa só aparece e só pode
 * ser decidida por essa pessoa -- se ela deixar o nível ou for
 * desativada, a etapa volta para todos (nada fica preso).
 *
 * SUGESTÕES são regras da administração que pré-escolhem a pessoa no
 * momento da aprovação (quem aprova pode trocar): por empresa e, opcional,
 * por centro de custo -- vale quando mais da metade dos itens do pedido
 * está nos centros de custo da regra.
 *
 * centros_custo_itens: na foto do pedido, o código do centro de custo de
 * cada item (separados por vírgula), para a regra da maioria.
 */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.portal_aprovacoes_etapas') AND name = 'direcionado_usuario_id')
  ALTER TABLE dbo.portal_aprovacoes_etapas ADD [direcionado_usuario_id] UNIQUEIDENTIFIER NULL
    CONSTRAINT FK_portal_aprovacoes_etapas_direcionado REFERENCES dbo.portal_usuarios([id]);

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.portal_aprovacoes_etapas') AND name = 'direcionado_nome')
  ALTER TABLE dbo.portal_aprovacoes_etapas ADD [direcionado_nome] NVARCHAR(200) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.portal_aprovacoes_pedido_compra') AND name = 'centros_custo_itens')
  ALTER TABLE dbo.portal_aprovacoes_pedido_compra ADD [centros_custo_itens] NVARCHAR(MAX) NULL;

IF OBJECT_ID(N'dbo.portal_alcadas_sugestoes', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_alcadas_sugestoes (
    [id] UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT DF_portal_alcadas_sugestoes_id DEFAULT NEWID()
      CONSTRAINT PK_portal_alcadas_sugestoes PRIMARY KEY,
    [alcada_id] UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT FK_portal_alcadas_sugestoes_alcada REFERENCES dbo.portal_alcadas([id]),
    /* O nível que será direcionado (o que vem depois de quem aprova). */
    [nivel_id] UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT FK_portal_alcadas_sugestoes_nivel REFERENCES dbo.portal_alcadas_niveis([id]),
    /* empr_id do Focco; NULL = qualquer empresa. */
    [empresa] INT NULL,
    /* Prefixos de centro de custo, separados por vírgula (ex.: "90.02, 90.90"); NULL = qualquer. */
    [centros_custo] NVARCHAR(400) NULL,
    /* Pessoa sugerida (tem que estar no nível); NULL = deixar para todos do nível. */
    [usuario_id] UNIQUEIDENTIFIER NULL
      CONSTRAINT FK_portal_alcadas_sugestoes_usuario REFERENCES dbo.portal_usuarios([id]),
    [ordem] INT NOT NULL,
    [criado_em] DATETIME2 NOT NULL
      CONSTRAINT DF_portal_alcadas_sugestoes_criado_em DEFAULT SYSDATETIME()
  );

  CREATE INDEX IX_portal_alcadas_sugestoes_alcada
    ON dbo.portal_alcadas_sugestoes ([alcada_id], [ordem]);
END;

COMMIT TRANSACTION;
