/*
 * Cálculo automático de tempo do Roteiro de Fabricação (análise em
 * docs/roteiro/calculo-automatico-tempos.md):
 * - eng_tempos_perfis: parâmetros de cálculo (laser/plasma = corte_cnc;
 *   guilhotina/dobra = tabela_dimensao), em JSON validado pelo Portal
 *   (src/lib/tempos-maquina/validacao.ts). Nasce inativo: só perfil ativo
 *   aparece no Roteiro.
 * - eng_tempos_maquinas: máquina do ERP (COD_RECURSO) -> perfil. Uma
 *   máquina tem no máximo um perfil; um perfil serve várias máquinas.
 * - eng_tempos_materiais: como reconhecer o material pela descrição da
 *   matéria-prima (densidade e variante da tabela de corte).
 */
SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.eng_tempos_perfis', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.eng_tempos_perfis (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_eng_tempos_perfis_id DEFAULT NEWID(),
    [nome] NVARCHAR(150) NOT NULL,
    [metodo] VARCHAR(20) NOT NULL CONSTRAINT CK_eng_tempos_perfis_metodo CHECK ([metodo] IN ('corte_cnc', 'tabela_dimensao')),
    [parametros] NVARCHAR(MAX) NOT NULL,
    [ativo] BIT NOT NULL CONSTRAINT DF_eng_tempos_perfis_ativo DEFAULT 0,
    [observacao] NVARCHAR(1000) NULL,
    [criado_em] DATETIME2 NOT NULL CONSTRAINT DF_eng_tempos_perfis_criado DEFAULT SYSDATETIME(),
    [atualizado_em] DATETIME2 NOT NULL CONSTRAINT DF_eng_tempos_perfis_atualizado DEFAULT SYSDATETIME(),
    [atualizado_por] NVARCHAR(150) NULL,
    CONSTRAINT PK_eng_tempos_perfis PRIMARY KEY ([id]),
    CONSTRAINT CK_eng_tempos_perfis_json CHECK (ISJSON([parametros]) = 1)
  );
  CREATE UNIQUE INDEX UX_eng_tempos_perfis_nome ON dbo.eng_tempos_perfis ([nome]);
END;

IF OBJECT_ID(N'dbo.eng_tempos_maquinas', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.eng_tempos_maquinas (
    [cod_recurso] VARCHAR(30) NOT NULL,
    /* Descrição do ERP no momento da ligação (para a lista não depender do ERP no ar). */
    [desc_recurso] NVARCHAR(150) NULL,
    [perfil_id] UNIQUEIDENTIFIER NOT NULL,
    [atualizado_em] DATETIME2 NOT NULL CONSTRAINT DF_eng_tempos_maquinas_atualizado DEFAULT SYSDATETIME(),
    [atualizado_por] NVARCHAR(150) NULL,
    CONSTRAINT PK_eng_tempos_maquinas PRIMARY KEY ([cod_recurso]),
    CONSTRAINT FK_eng_tempos_maquinas_perfil FOREIGN KEY ([perfil_id]) REFERENCES dbo.eng_tempos_perfis ([id])
  );
  CREATE INDEX IX_eng_tempos_maquinas_perfil ON dbo.eng_tempos_maquinas ([perfil_id]);
END;

IF OBJECT_ID(N'dbo.eng_tempos_materiais', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.eng_tempos_materiais (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_eng_tempos_materiais_id DEFAULT NEWID(),
    [nome] NVARCHAR(100) NOT NULL,
    /* Palavras procuradas na descrição da matéria-prima, separadas por vírgula (basta uma). */
    [termos] NVARCHAR(400) NOT NULL,
    [densidade] DECIMAL(9, 4) NOT NULL,
    /* Variante da tabela de corte para este material (ex.: "padrao"/"especial" no laser); NULL = automática. */
    [variante] VARCHAR(30) NULL,
    /* Menor primeiro: o primeiro material que bater vale. */
    [ordem] INT NOT NULL CONSTRAINT DF_eng_tempos_materiais_ordem DEFAULT 0,
    [ativo] BIT NOT NULL CONSTRAINT DF_eng_tempos_materiais_ativo DEFAULT 1,
    [criado_em] DATETIME2 NOT NULL CONSTRAINT DF_eng_tempos_materiais_criado DEFAULT SYSDATETIME(),
    [atualizado_em] DATETIME2 NOT NULL CONSTRAINT DF_eng_tempos_materiais_atualizado DEFAULT SYSDATETIME(),
    CONSTRAINT PK_eng_tempos_materiais PRIMARY KEY ([id]),
    CONSTRAINT CK_eng_tempos_materiais_densidade CHECK ([densidade] > 0)
  );

  /* Carga inicial: as densidades do app do PCP (aço/galvanizado 7,85; inox 7,93; alumínio 2,70). */
  INSERT INTO dbo.eng_tempos_materiais ([nome], [termos], [densidade], [variante], [ordem])
  VALUES
    (N'Aço inox', N'INOX', 7.93, NULL, 10),
    (N'Alumínio', N'ALUMINIO, ALUM', 2.70, NULL, 20),
    (N'Aço galvanizado', N'GALVANIZ, ZINCAD', 7.85, NULL, 30),
    (N'Aço carbono', N'ACO, ASTM, SAE, CARBONO', 7.85, NULL, 40);
END;

COMMIT TRANSACTION;
GO
