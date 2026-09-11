SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.com_estoque_equipamentos_usados', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.com_estoque_equipamentos_usados (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_com_estoque_equip_id DEFAULT NEWID(),
    [numero] INT IDENTITY(1,1) NOT NULL,
    [descricao] NVARCHAR(300) NOT NULL,
    [marca] NVARCHAR(100) NULL,
    [modelo] NVARCHAR(100) NULL,
    [numero_serie] NVARCHAR(100) NULL,
    [codigo_empresa] NVARCHAR(20) NULL,
    [erp_codigo_item] NVARCHAR(50) NULL,
    [erp_id_item] NVARCHAR(50) NULL,
    [erp_data_entrada] DATE NULL,
    [erp_validado_em] DATETIME2 NULL,
    [erp_validado_por] NVARCHAR(150) NULL,
    [status] VARCHAR(20) NOT NULL CONSTRAINT DF_com_estoque_equip_status DEFAULT 'em_estoque',
    [numero_nf_entrada] NVARCHAR(30) NOT NULL,
    [observacoes] NVARCHAR(1000) NULL,
    [criado_por_usuario_id] UNIQUEIDENTIFIER NOT NULL,
    [criado_por_nome] NVARCHAR(150) NOT NULL,
    [criado_em] DATETIME2 NOT NULL CONSTRAINT DF_com_estoque_equip_criado_em DEFAULT SYSDATETIME(),
    [atualizado_em] DATETIME2 NOT NULL CONSTRAINT DF_com_estoque_equip_atualizado_em DEFAULT SYSDATETIME(),
    CONSTRAINT PK_com_estoque_equipamentos_usados PRIMARY KEY ([id]),
    CONSTRAINT UQ_com_estoque_equip_numero UNIQUE ([numero]),
    CONSTRAINT CK_com_estoque_equip_status CHECK ([status] IN ('em_estoque', 'emprestado', 'consignado', 'baixado'))
  );

  CREATE INDEX IX_com_estoque_equip_status ON dbo.com_estoque_equipamentos_usados ([status]);
END;

IF OBJECT_ID(N'dbo.com_estoque_equipamentos_usados_movimentacoes', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.com_estoque_equipamentos_usados_movimentacoes (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_com_estoque_mov_id DEFAULT NEWID(),
    [equipamento_id] UNIQUEIDENTIFIER NOT NULL,
    [tipo_acao] VARCHAR(20) NOT NULL,
    [numero_nf] NVARCHAR(30) NOT NULL,
    [destinatario_nome] NVARCHAR(200) NULL,
    [motivo_baixa] VARCHAR(20) NULL,
    [status_resultante] VARCHAR(20) NOT NULL,
    [observacoes] NVARCHAR(1000) NULL,
    [data_acao] DATE NOT NULL,
    [criado_por_usuario_id] UNIQUEIDENTIFIER NOT NULL,
    [criado_por_nome] NVARCHAR(150) NOT NULL,
    [criado_em] DATETIME2 NOT NULL CONSTRAINT DF_com_estoque_mov_criado_em DEFAULT SYSDATETIME(),
    CONSTRAINT PK_com_estoque_equipamentos_usados_movimentacoes PRIMARY KEY ([id]),
    CONSTRAINT FK_com_estoque_mov_equipamento FOREIGN KEY ([equipamento_id])
      REFERENCES dbo.com_estoque_equipamentos_usados ([id]) ON DELETE CASCADE,
    CONSTRAINT CK_com_estoque_mov_tipo_acao CHECK ([tipo_acao] IN ('entrada', 'emprestimo', 'consignacao', 'retorno', 'baixa')),
    CONSTRAINT CK_com_estoque_mov_motivo_baixa CHECK ([motivo_baixa] IN ('venda', 'descarte', 'perda', 'outro') OR [motivo_baixa] IS NULL)
  );

  CREATE INDEX IX_com_estoque_mov_equipamento ON dbo.com_estoque_equipamentos_usados_movimentacoes ([equipamento_id], [criado_em]);
END;

IF OBJECT_ID(N'dbo.com_estoque_equipamentos_usados_config', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.com_estoque_equipamentos_usados_config (
    [id] INT NOT NULL,
    [url_validar_item] NVARCHAR(300) NULL,
    [url_validar_item_teste] NVARCHAR(300) NULL,
    [usar_ambiente_teste] BIT NOT NULL CONSTRAINT DF_com_estoque_config_ambiente DEFAULT 0,
    [chave_api] NVARCHAR(200) NULL,
    [atualizado_em] DATETIME2 NOT NULL CONSTRAINT DF_com_estoque_config_atualizado_em DEFAULT SYSDATETIME(),
    [atualizado_por] NVARCHAR(150) NULL,
    CONSTRAINT PK_com_estoque_equipamentos_usados_config PRIMARY KEY ([id])
  );
END;

COMMIT TRANSACTION;
