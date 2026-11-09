/*
 * Cálculo automático de tempo: registro de cada tempo calculado que a
 * pessoa usou no cadastro de operação do Roteiro de Fabricação. O tempo
 * é recalculado no servidor com o perfil ativo; perfil e máquina ficam
 * como foto (nome do perfil e os dados da peça na hora), para o registro
 * continuar legível mesmo se o perfil mudar ou for excluído.
 */
SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.eng_tempos_calculos', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.eng_tempos_calculos (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_eng_tempos_calculos_id DEFAULT NEWID(),
    [cod_item] VARCHAR(40) NOT NULL,
    [revisao] NVARCHAR(20) NULL,
    [alternativo] INT NULL,
    [seq] INT NULL,
    [cod_recurso] VARCHAR(30) NOT NULL,
    [perfil_id] UNIQUEIDENTIFIER NULL,
    [perfil_nome] NVARCHAR(150) NOT NULL,
    [tempo_min] DECIMAL(18, 6) NOT NULL,
    /* De onde veio a geometria: 'dxf' (arquivo do item) ou 'manual' (digitada). */
    [origem_geometria] VARCHAR(10) NOT NULL CONSTRAINT CK_eng_tempos_calculos_origem CHECK ([origem_geometria] IN ('dxf', 'manual')),
    [arquivo_dxf] NVARCHAR(400) NULL,
    /* Dados da peça usados no cálculo (espessura, geometria, matéria-prima, peso). */
    [dados] NVARCHAR(MAX) NOT NULL,
    /* Resultado completo (parcelas, referências, avisos). */
    [resultado] NVARCHAR(MAX) NOT NULL,
    [usuario_id] UNIQUEIDENTIFIER NULL,
    [usuario_nome] NVARCHAR(150) NULL,
    [criado_em] DATETIME2 NOT NULL CONSTRAINT DF_eng_tempos_calculos_criado DEFAULT SYSDATETIME(),
    CONSTRAINT PK_eng_tempos_calculos PRIMARY KEY ([id]),
    CONSTRAINT CK_eng_tempos_calculos_json CHECK (ISJSON([dados]) = 1 AND ISJSON([resultado]) = 1)
  );
  CREATE INDEX IX_eng_tempos_calculos_item ON dbo.eng_tempos_calculos ([cod_item], [criado_em] DESC);
  CREATE INDEX IX_eng_tempos_calculos_criado ON dbo.eng_tempos_calculos ([criado_em] DESC);
END;

COMMIT TRANSACTION;
GO
