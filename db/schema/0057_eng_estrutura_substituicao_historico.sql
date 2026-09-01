SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.eng_estrutura_substituicao_historico', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.eng_estrutura_substituicao_historico (
    id UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT PK_eng_estrutura_substituicao_historico PRIMARY KEY DEFAULT NEWID(),
    usuario_nome NVARCHAR(150) NOT NULL,
    empresa_nome NVARCHAR(200) NULL,
    ambiente VARCHAR(10) NOT NULL
      CONSTRAINT DF_eng_estr_subst_hist_ambiente DEFAULT 'producao',
    cod_pai NVARCHAR(60) NOT NULL,
    codigo_antigo NVARCHAR(60) NOT NULL,
    codigo_novo NVARCHAR(60) NOT NULL,
    sucesso BIT NOT NULL,
    mensagem_erro NVARCHAR(500) NULL,
    criado_em DATETIME2 NOT NULL
      CONSTRAINT DF_eng_estr_subst_hist_criado_em DEFAULT SYSDATETIME()
  );

  CREATE INDEX IX_eng_estrutura_substituicao_historico_criado_em
    ON dbo.eng_estrutura_substituicao_historico ([criado_em] DESC);
END;

COMMIT TRANSACTION;
