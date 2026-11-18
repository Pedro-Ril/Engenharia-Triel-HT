/*
 * Workstations NVIDIA (Administração → Sistema → Workstations NVIDIA).
 *
 * Cada workstation roda workstations-nvidia/Verificar-PerfilNvidia.ps1
 * (tarefa agendada via GPO, como SYSTEM), que confere/reaplica o perfil
 * NVIDIA oficial e grava um estado.json local. O portal lê esse arquivo
 * direto da máquina (caminho UNC configurável) e guarda aqui:
 *
 * - portal_ws_nvidia_config: configuração única (id = 1).
 * - portal_ws_nvidia_maquinas: uma linha por workstation, com a última
 *   foto do estado.json lido. Datas que vêm do script (verificado_em,
 *   ultima_reaplicacao_em) ficam como texto ISO com fuso, do jeito que o
 *   script gravou -- servem para comparar coletas e exibir, não para
 *   ordenar.
 * - portal_ws_nvidia_eventos: histórico gerado pelo portal ao comparar
 *   uma coleta com a anterior (driver mudou, reaplicado, falha, sem
 *   contato...). maquina_id NULL = evento geral (ex: perfil publicado).
 */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.portal_ws_nvidia_config', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_ws_nvidia_config (
    [id] INT NOT NULL CONSTRAINT PK_portal_ws_nvidia_config PRIMARY KEY,
    [caminho_estado] NVARCHAR(400) NOT NULL,
    [pasta_perfil] NVARCHAR(400) NULL,
    [coleta_ativa] BIT NOT NULL CONSTRAINT DF_portal_ws_nvidia_config_coleta_ativa DEFAULT 1,
    [intervalo_minutos] INT NOT NULL CONSTRAINT DF_portal_ws_nvidia_config_intervalo DEFAULT 30,
    [horas_sem_contato] INT NOT NULL CONSTRAINT DF_portal_ws_nvidia_config_horas_sem_contato DEFAULT 24,
    [emails_alerta] NVARCHAR(1000) NULL,
    [atualizado_em] DATETIME2 NOT NULL CONSTRAINT DF_portal_ws_nvidia_config_atualizado_em DEFAULT SYSDATETIME(),
    [atualizado_por] NVARCHAR(150) NULL,
    CONSTRAINT CK_portal_ws_nvidia_config_id CHECK ([id] = 1),
    CONSTRAINT CK_portal_ws_nvidia_config_intervalo CHECK ([intervalo_minutos] BETWEEN 5 AND 1440),
    CONSTRAINT CK_portal_ws_nvidia_config_horas CHECK ([horas_sem_contato] BETWEEN 1 AND 720)
  );
END;

IF NOT EXISTS (SELECT 1 FROM dbo.portal_ws_nvidia_config WHERE [id] = 1)
  INSERT INTO dbo.portal_ws_nvidia_config ([id], [caminho_estado])
  VALUES (1, N'\\{computador}\C$\ProgramData\TI\NvidiaProfile\estado.json');

IF OBJECT_ID(N'dbo.portal_ws_nvidia_maquinas', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_ws_nvidia_maquinas (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_portal_ws_nvidia_maquinas_id DEFAULT NEWID()
      CONSTRAINT PK_portal_ws_nvidia_maquinas PRIMARY KEY,
    [computador] NVARCHAR(100) NOT NULL,
    [descricao] NVARCHAR(200) NULL,
    [ativo] BIT NOT NULL CONSTRAINT DF_portal_ws_nvidia_maquinas_ativo DEFAULT 1,

    /* Última tentativa de coleta (portal) */
    [coleta_em] DATETIME2 NULL,
    [coleta_ok] BIT NULL,
    [coleta_erro] NVARCHAR(500) NULL,
    [contato_em] DATETIME2 NULL,
    [alerta_sem_contato_enviado] BIT NOT NULL CONSTRAINT DF_portal_ws_nvidia_maquinas_alerta DEFAULT 0,

    /* Última foto do estado.json */
    [verificado_em] NVARCHAR(40) NULL,
    [executado_como] NVARCHAR(150) NULL,
    [gpu] NVARCHAR(150) NULL,
    [driver_windows] NVARCHAR(30) NULL,
    [driver_nvidia] NVARCHAR(20) NULL,
    [data_driver] NVARCHAR(10) NULL,
    [conforme] BIT NULL,
    [acao] NVARCHAR(30) NULL,
    [erro_script] NVARCHAR(1000) NULL,
    [perfil_hash] NVARCHAR(64) NULL,
    [divergencias_json] NVARCHAR(MAX) NULL,
    [ultima_reaplicacao_em] NVARCHAR(40) NULL,
    [ultima_reaplicacao_sucesso] BIT NULL,

    [criado_em] DATETIME2 NOT NULL CONSTRAINT DF_portal_ws_nvidia_maquinas_criado_em DEFAULT SYSDATETIME(),
    [criado_por] NVARCHAR(150) NULL,
    CONSTRAINT UQ_portal_ws_nvidia_maquinas_computador UNIQUE ([computador])
  );
END;

IF OBJECT_ID(N'dbo.portal_ws_nvidia_eventos', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_ws_nvidia_eventos (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_portal_ws_nvidia_eventos_id DEFAULT NEWID()
      CONSTRAINT PK_portal_ws_nvidia_eventos PRIMARY KEY,
    [maquina_id] UNIQUEIDENTIFIER NULL
      CONSTRAINT FK_portal_ws_nvidia_eventos_maquina
        REFERENCES dbo.portal_ws_nvidia_maquinas ([id]) ON DELETE CASCADE,
    [computador] NVARCHAR(100) NULL,
    [tipo] NVARCHAR(40) NOT NULL,
    [descricao] NVARCHAR(1000) NOT NULL,
    [ocorrido_em] DATETIME2 NOT NULL CONSTRAINT DF_portal_ws_nvidia_eventos_ocorrido_em DEFAULT SYSDATETIME()
  );

  CREATE INDEX IX_portal_ws_nvidia_eventos_ocorrido_em
    ON dbo.portal_ws_nvidia_eventos ([ocorrido_em] DESC);

  CREATE INDEX IX_portal_ws_nvidia_eventos_maquina
    ON dbo.portal_ws_nvidia_eventos ([maquina_id], [ocorrido_em] DESC);
END;

COMMIT TRANSACTION;
