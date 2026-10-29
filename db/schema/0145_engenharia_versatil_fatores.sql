/*
 * Engenharia Versátil -- fase 2: fator de conversão para KG.
 *
 * Para cada item da planilha, compara o peso (líquido) com o do ERP e
 * cadastra/corrige a conversão unidade de estoque -> KG (taxa = 1 / peso
 * líquido) pela API Oracle (/api/fator-conversao, tela FITE0112).
 *
 * - eng_versatil_config ganha a API do ERP, a empresa (40 = Versátil) e o
 *   ambiente. O ambiente nasce em TESTE: produção é uma troca consciente
 *   na administração.
 * - eng_versatil_fatores / _itens: o registro de cada gravação e de cada
 *   item (incluído, alterado, erro), com taxa antes/depois e de onde veio
 *   o peso (ERP ou planilha, quando o usuário optou pela planilha num item
 *   divergente).
 *
 * Aplicar com sqlcmd -f 65001.
 */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.eng_versatil_config') AND name = 'erp_api_url')
  ALTER TABLE dbo.eng_versatil_config ADD [erp_api_url] NVARCHAR(300) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.eng_versatil_config') AND name = 'erp_cod_empresa')
  ALTER TABLE dbo.eng_versatil_config ADD [erp_cod_empresa] INT NULL;

/* teste | producao */
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.eng_versatil_config') AND name = 'erp_ambiente')
  ALTER TABLE dbo.eng_versatil_config ADD [erp_ambiente] VARCHAR(10) NULL;

COMMIT TRANSACTION;
GO

SET XACT_ABORT ON;
BEGIN TRANSACTION;

UPDATE dbo.eng_versatil_config
SET [erp_api_url] = COALESCE([erp_api_url], N'http://proserver.trielht.com.br:1000'),
    [erp_cod_empresa] = COALESCE([erp_cod_empresa], 40),
    [erp_ambiente] = COALESCE([erp_ambiente], 'teste')
WHERE [id] = 1;

IF OBJECT_ID(N'dbo.eng_versatil_fatores', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.eng_versatil_fatores (
    [id] UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT DF_eng_versatil_fatores_id DEFAULT NEWID()
      CONSTRAINT PK_eng_versatil_fatores PRIMARY KEY,
    [numero_projeto] NVARCHAR(30) NOT NULL,
    [arquivo_planilha] NVARCHAR(300) NOT NULL,
    [cod_empresa] INT NOT NULL,
    /* teste | producao */
    [ambiente] VARCHAR(10) NOT NULL,
    /* concluida | erro */
    [status] VARCHAR(20) NOT NULL,
    [incluidos] INT NOT NULL CONSTRAINT DF_eng_versatil_fatores_incluidos DEFAULT 0,
    [alterados] INT NOT NULL CONSTRAINT DF_eng_versatil_fatores_alterados DEFAULT 0,
    [mensagem] NVARCHAR(2000) NULL,
    [usuario_id] UNIQUEIDENTIFIER NULL
      CONSTRAINT FK_eng_versatil_fatores_usuario REFERENCES dbo.portal_usuarios([id]),
    [usuario_nome] NVARCHAR(200) NOT NULL,
    [criado_em] DATETIME2 NOT NULL
      CONSTRAINT DF_eng_versatil_fatores_criado_em DEFAULT SYSDATETIME()
  );

  CREATE INDEX IX_eng_versatil_fatores_criado_em ON dbo.eng_versatil_fatores ([criado_em] DESC);
END;

IF OBJECT_ID(N'dbo.eng_versatil_fatores_itens', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.eng_versatil_fatores_itens (
    [id] UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT DF_eng_versatil_fatores_itens_id DEFAULT NEWID()
      CONSTRAINT PK_eng_versatil_fatores_itens PRIMARY KEY,
    [fator_id] UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT FK_eng_versatil_fatores_itens_fator REFERENCES dbo.eng_versatil_fatores([id]),
    [ordem] INT NOT NULL,
    [aba] NVARCHAR(100) NULL,
    [codigo] NVARCHAR(50) NOT NULL,
    [unid_estoque] NVARCHAR(10) NULL,
    [peso_planilha] DECIMAL(18, 6) NULL,
    [peso_erp] DECIMAL(18, 6) NULL,
    /* erp | planilha */
    [origem_peso] VARCHAR(10) NOT NULL,
    [taxa_antes] DECIMAL(21, 10) NULL,
    [taxa_nova] DECIMAL(21, 10) NULL,
    /* incluido | alterado | mantido | erro */
    [acao] VARCHAR(20) NOT NULL,
    [conversao_id] BIGINT NULL,
    [leitura] NVARCHAR(200) NULL,
    [mensagem] NVARCHAR(1000) NULL,
    [criado_em] DATETIME2 NOT NULL
      CONSTRAINT DF_eng_versatil_fatores_itens_criado_em DEFAULT SYSDATETIME()
  );

  CREATE INDEX IX_eng_versatil_fatores_itens_fator ON dbo.eng_versatil_fatores_itens ([fator_id], [ordem]);
END;

COMMIT TRANSACTION;
