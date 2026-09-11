SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.com_estoque_tipos_equipamento', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.com_estoque_tipos_equipamento (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_com_estoque_tipos_equip_id DEFAULT NEWID(),
    [nome] NVARCHAR(150) NOT NULL,
    [ativo] BIT NOT NULL CONSTRAINT DF_com_estoque_tipos_equip_ativo DEFAULT 1,
    [criado_em] DATETIME2 NOT NULL CONSTRAINT DF_com_estoque_tipos_equip_criado_em DEFAULT SYSDATETIME(),
    [atualizado_em] DATETIME2 NOT NULL CONSTRAINT DF_com_estoque_tipos_equip_atualizado_em DEFAULT SYSDATETIME(),
    CONSTRAINT PK_com_estoque_tipos_equipamento PRIMARY KEY ([id]),
    CONSTRAINT UQ_com_estoque_tipos_equip_nome UNIQUE ([nome])
  );
END;

IF OBJECT_ID(N'dbo.com_estoque_tipos_equipamento_campos', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.com_estoque_tipos_equipamento_campos (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_com_estoque_tipo_campo_id DEFAULT NEWID(),
    [tipo_equipamento_id] UNIQUEIDENTIFIER NOT NULL,
    [bloco] VARCHAR(20) NOT NULL,
    [chave] VARCHAR(60) NOT NULL,
    [rotulo] NVARCHAR(150) NOT NULL,
    [tipo_dado] VARCHAR(20) NOT NULL,
    [opcoes] NVARCHAR(MAX) NULL,
    [unidade] NVARCHAR(20) NULL,
    [obrigatorio] BIT NOT NULL CONSTRAINT DF_com_estoque_tipo_campo_obrigatorio DEFAULT 0,
    [ordem] INT NOT NULL CONSTRAINT DF_com_estoque_tipo_campo_ordem DEFAULT 0,
    [ativo] BIT NOT NULL CONSTRAINT DF_com_estoque_tipo_campo_ativo DEFAULT 1,
    [criado_em] DATETIME2 NOT NULL CONSTRAINT DF_com_estoque_tipo_campo_criado_em DEFAULT SYSDATETIME(),
    [atualizado_em] DATETIME2 NOT NULL CONSTRAINT DF_com_estoque_tipo_campo_atualizado_em DEFAULT SYSDATETIME(),
    CONSTRAINT PK_com_estoque_tipos_equipamento_campos PRIMARY KEY ([id]),
    CONSTRAINT FK_com_estoque_tipo_campo_tipo FOREIGN KEY ([tipo_equipamento_id])
      REFERENCES dbo.com_estoque_tipos_equipamento ([id]) ON DELETE CASCADE,
    CONSTRAINT UQ_com_estoque_tipo_campo_chave UNIQUE ([tipo_equipamento_id], [chave]),
    CONSTRAINT CK_com_estoque_tipo_campo_bloco CHECK ([bloco] IN ('tecnicas', 'conservacao', 'observacoes')),
    CONSTRAINT CK_com_estoque_tipo_campo_tipo_dado CHECK ([tipo_dado] IN ('texto', 'numero', 'data', 'booleano', 'unica_escolha', 'multipla_escolha')),
    CONSTRAINT CK_com_estoque_tipo_campo_opcoes CHECK ([opcoes] IS NULL OR ISJSON([opcoes]) = 1)
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.com_estoque_equipamentos_usados') AND name = 'tipo_equipamento_id')
BEGIN
  ALTER TABLE dbo.com_estoque_equipamentos_usados ADD [tipo_equipamento_id] UNIQUEIDENTIFIER NULL;
END;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.com_estoque_equipamentos_usados') AND name = 'nome_cliente')
BEGIN
  ALTER TABLE dbo.com_estoque_equipamentos_usados ADD [nome_cliente] NVARCHAR(200) NULL;
END;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.com_estoque_equipamentos_usados') AND name = 'valor')
BEGIN
  ALTER TABLE dbo.com_estoque_equipamentos_usados ADD [valor] DECIMAL(12, 2) NULL;
END;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.com_estoque_equipamentos_usados') AND name = 'campos_valores')
BEGIN
  ALTER TABLE dbo.com_estoque_equipamentos_usados
    ADD [campos_valores] NVARCHAR(MAX) NULL
      CONSTRAINT CK_com_estoque_equip_campos_valores CHECK ([campos_valores] IS NULL OR ISJSON([campos_valores]) = 1);
END;

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id = OBJECT_ID(N'dbo.com_estoque_equipamentos_usados') AND name = 'FK_com_estoque_equip_tipo')
BEGIN
  ALTER TABLE dbo.com_estoque_equipamentos_usados
    ADD CONSTRAINT FK_com_estoque_equip_tipo FOREIGN KEY ([tipo_equipamento_id])
      REFERENCES dbo.com_estoque_tipos_equipamento ([id]);
END;

IF OBJECT_ID(N'dbo.com_estoque_equipamentos_usados_evidencias', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.com_estoque_equipamentos_usados_evidencias (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_com_estoque_evid_id DEFAULT NEWID(),
    [equipamento_id] UNIQUEIDENTIFIER NOT NULL,
    [bloco] VARCHAR(20) NOT NULL,
    [nome_arquivo] NVARCHAR(260) NOT NULL,
    [tipo_mime] VARCHAR(100) NOT NULL,
    [tamanho_bytes] INT NOT NULL,
    [conteudo] VARBINARY(MAX) NOT NULL,
    [criado_por_usuario_id] UNIQUEIDENTIFIER NOT NULL,
    [criado_por_nome] NVARCHAR(150) NOT NULL,
    [criado_em] DATETIME2 NOT NULL CONSTRAINT DF_com_estoque_evid_criado_em DEFAULT SYSDATETIME(),
    CONSTRAINT PK_com_estoque_equipamentos_usados_evidencias PRIMARY KEY ([id]),
    CONSTRAINT FK_com_estoque_evid_equipamento FOREIGN KEY ([equipamento_id])
      REFERENCES dbo.com_estoque_equipamentos_usados ([id]) ON DELETE CASCADE,
    CONSTRAINT CK_com_estoque_evid_bloco CHECK ([bloco] IN ('recebimento', 'tecnicas', 'conservacao', 'observacoes')),
    CONSTRAINT CK_com_estoque_evid_tipo_mime CHECK ([tipo_mime] IN ('image/png', 'image/jpeg', 'image/gif', 'image/webp'))
  );

  CREATE INDEX IX_com_estoque_evid_equipamento_bloco ON dbo.com_estoque_equipamentos_usados_evidencias ([equipamento_id], [bloco]);
END;

COMMIT TRANSACTION;
