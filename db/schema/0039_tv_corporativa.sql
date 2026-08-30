SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.portal_tv_config', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_tv_config (
    [id]               INT NOT NULL PRIMARY KEY CHECK ([id] = 1),
    [diretorio_midias] NVARCHAR(500) NULL,
    [atualizado_em]    DATETIME2 NOT NULL CONSTRAINT DF_ptvc_atualizado_em DEFAULT SYSDATETIME(),
    [atualizado_por]   NVARCHAR(150) NULL
  );
END;

IF OBJECT_ID(N'dbo.portal_tv_grades', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_tv_grades (
    [id]            UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_ptvg_id DEFAULT NEWID() PRIMARY KEY,
    [nome]          NVARCHAR(150) NOT NULL,
    [ativa]         BIT NOT NULL CONSTRAINT DF_ptvg_ativa DEFAULT 1,
    [criado_por]    NVARCHAR(150) NULL,
    [criado_em]     DATETIME2 NOT NULL CONSTRAINT DF_ptvg_criado_em DEFAULT SYSDATETIME(),
    [atualizado_em] DATETIME2 NOT NULL CONSTRAINT DF_ptvg_atualizado_em DEFAULT SYSDATETIME()
  );
END;

IF OBJECT_ID(N'dbo.portal_tv_terminais', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_tv_terminais (
    [id]                             UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_ptvt_id DEFAULT NEWID() PRIMARY KEY,
    [codigo_pareamento]              VARCHAR(8) NULL,
    [codigo_pareamento_expira_em]    DATETIME2 NULL,
    [nome]                           NVARCHAR(150) NULL,
    [identificador_hardware]         NVARCHAR(200) NOT NULL,
    [token_hash]                     VARBINARY(64) NULL,
    [status]                         VARCHAR(20) NOT NULL CONSTRAINT DF_ptvt_status DEFAULT 'aguardando_pareamento',
    [ultimo_heartbeat_em]            DATETIME2 NULL,
    [intervalo_atualizacao_segundos] INT NOT NULL CONSTRAINT DF_ptvt_intervalo DEFAULT 30,
    [grade_id]                       UNIQUEIDENTIFIER NULL CONSTRAINT FK_ptvt_grade REFERENCES dbo.portal_tv_grades([id]) ON DELETE SET NULL,
    [criado_em]                      DATETIME2 NOT NULL CONSTRAINT DF_ptvt_criado_em DEFAULT SYSDATETIME(),
    [atualizado_em]                  DATETIME2 NOT NULL CONSTRAINT DF_ptvt_atualizado_em DEFAULT SYSDATETIME(),
    [revogado_em]                    DATETIME2 NULL,
    CONSTRAINT UQ_ptvt_identificador_hardware UNIQUE ([identificador_hardware])
  );

  CREATE INDEX IX_ptvt_codigo_pareamento ON dbo.portal_tv_terminais ([codigo_pareamento]);
END;

IF OBJECT_ID(N'dbo.portal_tv_grade_slots', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_tv_grade_slots (
    [id]          UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_ptvgs_id DEFAULT NEWID() PRIMARY KEY,
    [grade_id]    UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_ptvgs_grade REFERENCES dbo.portal_tv_grades([id]) ON DELETE CASCADE,
    [nome]        NVARCHAR(100) NULL,
    [dias_semana] VARCHAR(20) NOT NULL CONSTRAINT DF_ptvgs_dias DEFAULT 'todos',
    [hora_inicio] TIME NOT NULL,
    [hora_fim]    TIME NOT NULL,
    [ordem]       INT NOT NULL CONSTRAINT DF_ptvgs_ordem DEFAULT 0
  );

  CREATE INDEX IX_ptvgs_grade_id ON dbo.portal_tv_grade_slots ([grade_id]);
END;

IF OBJECT_ID(N'dbo.portal_tv_midias', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_tv_midias (
    [id]              UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_ptvm_id DEFAULT NEWID() PRIMARY KEY,
    [nome_original]   NVARCHAR(260) NOT NULL,
    [tipo_mime]       NVARCHAR(150) NOT NULL,
    [tipo]            VARCHAR(20) NOT NULL,
    [tamanho_bytes]   BIGINT NOT NULL,
    [caminho_arquivo] NVARCHAR(500) NOT NULL,
    [enviado_por]     NVARCHAR(150) NULL,
    [criado_em]       DATETIME2 NOT NULL CONSTRAINT DF_ptvm_criado_em DEFAULT SYSDATETIME()
  );
END;

IF OBJECT_ID(N'dbo.portal_tv_slot_itens', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_tv_slot_itens (
    [id]               UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_ptvsi_id DEFAULT NEWID() PRIMARY KEY,
    [slot_id]          UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_ptvsi_slot REFERENCES dbo.portal_tv_grade_slots([id]) ON DELETE CASCADE,
    [tipo_conteudo]    VARCHAR(20) NOT NULL,
    [midia_id]         UNIQUEIDENTIFIER NULL CONSTRAINT FK_ptvsi_midia REFERENCES dbo.portal_tv_midias([id]) ON DELETE NO ACTION,
    [url_pagina_web]   NVARCHAR(500) NULL,
    [duracao_segundos] INT NOT NULL CONSTRAINT DF_ptvsi_duracao DEFAULT 15,
    [ordem]            INT NOT NULL CONSTRAINT DF_ptvsi_ordem DEFAULT 0
  );

  CREATE INDEX IX_ptvsi_slot_id ON dbo.portal_tv_slot_itens ([slot_id]);
  CREATE INDEX IX_ptvsi_midia_id ON dbo.portal_tv_slot_itens ([midia_id]);
END;

COMMIT TRANSACTION;
