/*
 * Administração dos pedidos de compra (Diretoria -> Pedidos de Compra).
 *
 * 1. Escopo por empresa: quais empresas do Focco cada diretor aprova.
 *    Nega por padrão, como o resto do módulo: aprovador de pedido de
 *    compra sem nenhuma empresa marcada não recebe pedido.
 *
 * 2. Integração (linha única id=1): onde o portal busca o pedido no ERP
 *    (produção/teste, mesmo padrão do Estoque de Equipamentos Usados) e
 *    a chave que o SupriConnect usa para chamar o portal. Da chave fica
 *    só o hash SHA-256 e os 4 últimos caracteres (para reconhecer qual
 *    está em uso) -- o valor aparece uma vez, na hora de gerar.
 */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.portal_aprovacoes_pedido_compra_empresas', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_aprovacoes_pedido_compra_empresas (
    [id] UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT DF_portal_aprov_pc_empresas_id DEFAULT NEWID()
      CONSTRAINT PK_portal_aprov_pc_empresas PRIMARY KEY,
    [usuario_id] UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT FK_portal_aprov_pc_empresas_usuario REFERENCES dbo.portal_usuarios([id]),
    /* empr_id do Focco: 2 = Triel-HT, 30 = Usitec, 40 = Versátil. */
    [empresa] INT NOT NULL,
    [criado_em] DATETIME2 NOT NULL
      CONSTRAINT DF_portal_aprov_pc_empresas_criado_em DEFAULT SYSDATETIME(),
    [criado_por] NVARCHAR(200) NULL,
    CONSTRAINT UX_portal_aprov_pc_empresas UNIQUE ([usuario_id], [empresa])
  );
END;

IF OBJECT_ID(N'dbo.portal_aprovacoes_pedido_compra_config', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_aprovacoes_pedido_compra_config (
    [id] INT NOT NULL
      CONSTRAINT PK_portal_aprov_pc_config PRIMARY KEY
      CONSTRAINT CK_portal_aprov_pc_config_id CHECK ([id] = 1),
    /* Consulta do pedido no ERP (cabeçalho, fornecedor, itens). */
    [url_pedido] NVARCHAR(300) NULL,
    [url_pedido_teste] NVARCHAR(300) NULL,
    [usar_ambiente_teste] BIT NOT NULL
      CONSTRAINT DF_portal_aprov_pc_config_teste DEFAULT 0,
    /* Bearer enviado ao ERP. */
    [chave_api_erp] NVARCHAR(200) NULL,
    /* Chave que o SupriConnect manda em X-Api-Key. */
    [chave_externa_hash] CHAR(64) NULL,
    [chave_externa_final] VARCHAR(8) NULL,
    [chave_externa_gerada_em] DATETIME2 NULL,
    [chave_externa_gerada_por] NVARCHAR(200) NULL,
    [atualizado_em] DATETIME2 NULL,
    [atualizado_por] NVARCHAR(200) NULL
  );

  INSERT INTO dbo.portal_aprovacoes_pedido_compra_config ([id]) VALUES (1);
END;

COMMIT TRANSACTION;
