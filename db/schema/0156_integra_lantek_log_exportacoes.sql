/*
 * Integra Lantek (Agro e VE): registro de cada exportação da planilha, linha
 * a linha, para analisar casos de DXF trocado (item e quantidade certos,
 * DXF de outra peça -- relato do PCP Agro em 06/11/2026).
 *
 * Por linha fica o DXF que foi para a planilha (o que a tela mandou) e o que
 * o servidor encontraria na hora, recalculado com a mesma regra da
 * validação, com todos os candidatos pelo código do item e pelo código do
 * desenho, data/tamanho do arquivo e um alerta quando algo é suspeito.
 */
SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.integra_lantek_exportacoes', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.integra_lantek_exportacoes (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_integra_lantek_exp_id DEFAULT NEWID(),
    [modulo] VARCHAR(10) NOT NULL CONSTRAINT CK_integra_lantek_exp_modulo CHECK ([modulo] IN ('agro', 've')),
    [status] VARCHAR(10) NOT NULL CONSTRAINT CK_integra_lantek_exp_status CHECK ([status] IN ('sucesso', 'erro')),
    [arquivo] NVARCHAR(500) NULL,
    [pasta_dxf] NVARCHAR(500) NULL,
    [total_linhas] INT NOT NULL CONSTRAINT DF_integra_lantek_exp_total DEFAULT 0,
    [total_alertas] INT NOT NULL CONSTRAINT DF_integra_lantek_exp_alertas DEFAULT 0,
    [mensagem_erro] NVARCHAR(2000) NULL,
    [usuario_id] UNIQUEIDENTIFIER NULL,
    [usuario_nome] NVARCHAR(150) NULL,
    [criado_em] DATETIME2 NOT NULL CONSTRAINT DF_integra_lantek_exp_criado DEFAULT SYSDATETIME(),
    CONSTRAINT PK_integra_lantek_exportacoes PRIMARY KEY ([id])
  );
  CREATE INDEX IX_integra_lantek_exp_criado ON dbo.integra_lantek_exportacoes ([criado_em] DESC);
END;

IF OBJECT_ID(N'dbo.integra_lantek_exportacao_itens', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.integra_lantek_exportacao_itens (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_integra_lantek_item_id DEFAULT NEWID(),
    [exportacao_id] UNIQUEIDENTIFIER NOT NULL,
    [linha] INT NOT NULL,
    [num_ordem] NVARCHAR(30) NULL,
    [num_lote] NVARCHAR(30) NULL,
    [cod_item] NVARCHAR(60) NULL,
    [cod_desenho] NVARCHAR(60) NULL,
    [qtde] NVARCHAR(30) NULL,
    [dxf_exportado] NVARCHAR(500) NULL,
    [dxf_servidor] NVARCHAR(500) NULL,
    [origem_servidor] VARCHAR(15) NULL,
    [candidatos_codigo] NVARCHAR(MAX) NULL,
    [candidatos_desenho] NVARCHAR(MAX) NULL,
    [dxf_modificado_em] DATETIME2 NULL,
    [dxf_tamanho] BIGINT NULL,
    [alertas] NVARCHAR(1000) NULL,
    CONSTRAINT PK_integra_lantek_exportacao_itens PRIMARY KEY ([id]),
    CONSTRAINT FK_integra_lantek_item_exportacao FOREIGN KEY ([exportacao_id])
      REFERENCES dbo.integra_lantek_exportacoes ([id]) ON DELETE CASCADE
  );
  CREATE INDEX IX_integra_lantek_item_exportacao ON dbo.integra_lantek_exportacao_itens ([exportacao_id], [linha]);
  CREATE INDEX IX_integra_lantek_item_ordem ON dbo.integra_lantek_exportacao_itens ([num_ordem], [cod_item]);
END;

COMMIT TRANSACTION;
GO
