/*
 * Aprovações: pedidos de compra vindos do sistema legado (SupriConnect).
 *
 * O pedido nasce no Focco; o comprador escolhe no legado quais mandar
 * para aprovação, e o legado chama o portal só com a chave de cada um
 * (empresa + número do pedido). O resto (fornecedor, itens, valores) o
 * portal busca no ERP quando precisar -- aqui fica só a chave e a
 * decisão.
 *
 * Mesmo desenho do reajuste: portal_aprovacoes é o lote (um envio do
 * legado) e cada pedido é um item com decisão própria.
 *
 * O legado não tem login, então o lote não tem usuário do portal como
 * criador: criado_por_usuario_id passa a aceitar NULL, e a coluna nova
 * `origem` diz de onde ele veio.
 */
/* Índice filtrado exige estas opções ligadas (o sqlcmd vem com QUOTED_IDENTIFIER OFF). */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.portal_aprovacoes')
    AND name = 'criado_por_usuario_id'
    AND is_nullable = 0
)
  ALTER TABLE dbo.portal_aprovacoes ALTER COLUMN [criado_por_usuario_id] UNIQUEIDENTIFIER NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.portal_aprovacoes') AND name = 'origem')
  ALTER TABLE dbo.portal_aprovacoes ADD [origem] VARCHAR(40) NULL;

IF OBJECT_ID(N'dbo.portal_aprovacoes_pedido_compra', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_aprovacoes_pedido_compra (
    [id] UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT DF_portal_aprov_pedido_compra_id DEFAULT NEWID()
      CONSTRAINT PK_portal_aprov_pedido_compra PRIMARY KEY,
    [aprovacao_id] UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT FK_portal_aprov_pedido_compra_aprovacao REFERENCES dbo.portal_aprovacoes([id]),
    /* empr_id do Focco: 2 = Triel-HT, 30 = Usitec, 40 = Versátil. */
    [empresa] INT NOT NULL,
    /* cod_pedc do Focco -- único entre as empresas; a empresa vem junto como contexto. */
    [numero_pedido] BIGINT NOT NULL,
    /* pendente | aprovado | reprovado */
    [status] VARCHAR(20) NOT NULL
      CONSTRAINT DF_portal_aprov_pedido_compra_status DEFAULT 'pendente',
    [decidido_por_usuario_id] UNIQUEIDENTIFIER NULL
      CONSTRAINT FK_portal_aprov_pedido_compra_decisor REFERENCES dbo.portal_usuarios([id]),
    [decidido_por_nome] NVARCHAR(200) NULL,
    [decidido_em] DATETIME2 NULL,
    [comentario_decisao] NVARCHAR(2000) NULL,
    [criado_em] DATETIME2 NOT NULL
      CONSTRAINT DF_portal_aprov_pedido_compra_criado_em DEFAULT SYSDATETIME(),
    [atualizado_em] DATETIME2 NOT NULL
      CONSTRAINT DF_portal_aprov_pedido_compra_atualizado_em DEFAULT SYSDATETIME()
  );

  /* Consulta de situação do legado: o envio mais recente de um pedido. */
  CREATE INDEX IX_portal_aprov_pedido_compra_pedido
    ON dbo.portal_aprovacoes_pedido_compra ([empresa], [numero_pedido], [criado_em] DESC);

  /* Um pedido não fica pendente duas vezes: o reenvio enquanto pendente não duplica. */
  CREATE UNIQUE INDEX UX_portal_aprov_pedido_compra_pendente
    ON dbo.portal_aprovacoes_pedido_compra ([empresa], [numero_pedido])
    WHERE [status] = 'pendente';
END;

COMMIT TRANSACTION;
