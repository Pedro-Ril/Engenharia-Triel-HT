/*
 * Integra Lantek (Agro e VE): registro de cada etapa da integração, para
 * entender onde o DXF troca quando duplicar de novo -- pesquisa de
 * ordem/lote no ERP (o que o ERP devolveu), busca/validação de DXF (que
 * arquivo cada peça recebeu e por qual regra) e exportação (ligada ao
 * detalhe linha a linha de integra_lantek_exportacao_itens, migração 0156).
 * Consultado pelo botão "Registros" na tela da integração.
 */
SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.integra_lantek_eventos', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.integra_lantek_eventos (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_integra_lantek_evt_id DEFAULT NEWID(),
    [modulo] VARCHAR(10) NULL CONSTRAINT CK_integra_lantek_evt_modulo CHECK ([modulo] IN ('agro', 've')),
    [tipo] VARCHAR(20) NOT NULL CONSTRAINT CK_integra_lantek_evt_tipo CHECK ([tipo] IN ('pesquisa_erp', 'validacao_dxf', 'exportacao')),
    [sucesso] BIT NOT NULL,
    [resumo] NVARCHAR(400) NOT NULL,
    [parametros] NVARCHAR(MAX) NULL,
    [resultado] NVARCHAR(MAX) NULL,
    [total] INT NULL,
    [duracao_ms] INT NULL,
    [erro] NVARCHAR(2000) NULL,
    [exportacao_id] UNIQUEIDENTIFIER NULL,
    [usuario_id] UNIQUEIDENTIFIER NULL,
    [usuario_nome] NVARCHAR(150) NULL,
    [criado_em] DATETIME2 NOT NULL CONSTRAINT DF_integra_lantek_evt_criado DEFAULT SYSDATETIME(),
    CONSTRAINT PK_integra_lantek_eventos PRIMARY KEY ([id]),
    CONSTRAINT FK_integra_lantek_evt_exportacao FOREIGN KEY ([exportacao_id])
      REFERENCES dbo.integra_lantek_exportacoes ([id]) ON DELETE CASCADE
  );
  CREATE INDEX IX_integra_lantek_evt_criado ON dbo.integra_lantek_eventos ([criado_em] DESC);
  CREATE INDEX IX_integra_lantek_evt_modulo ON dbo.integra_lantek_eventos ([modulo], [criado_em] DESC);
END;

COMMIT TRANSACTION;
GO
