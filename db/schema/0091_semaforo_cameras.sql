SET XACT_ABORT ON;
BEGIN TRANSACTION;

/*
 * Config singleton (mesmo molde de portal_tv_config/portal_configuracao_smtp)
 * -- modo_legado comeca LIGADO de proposito: aplicar esta migracao nunca muda
 * o comportamento visivel do modulo sozinha, so depois que um admin desligar
 * a flag explicitamente e que a tela nova (semaforo + cameras) passa a valer.
 */
IF OBJECT_ID(N'dbo.com_semaforo_config', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.com_semaforo_config (
    [id] INT NOT NULL CONSTRAINT PK_com_semaforo_config PRIMARY KEY CHECK ([id] = 1),
    [modo_legado] BIT NOT NULL CONSTRAINT DF_com_semaforo_config_modo_legado DEFAULT 1,
    [mediamtx_api_url] NVARCHAR(300) NULL,
    [mediamtx_whep_base_url] NVARCHAR(300) NULL,
    [atualizado_em] DATETIME2 NOT NULL CONSTRAINT DF_com_semaforo_config_atualizado_em DEFAULT SYSDATETIME(),
    [atualizado_por] NVARCHAR(150) NULL
  );
END;

/*
 * Lista de cameras (nao singleton) -- stream_uri_rtsp e so um CACHE do
 * GetStreamUri (ONVIF), sem credenciais embutidas: a credencial usada de
 * verdade em tempo de execucao vem sempre de [usuario]/[senha_cifrada].
 * mediamtx_path e gerado uma unica vez na criacao e nunca muda -- e o nome
 * do path no MediaMTX e o segmento da URL WHEP usada pelo navegador.
 */
IF OBJECT_ID(N'dbo.com_semaforo_cameras', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.com_semaforo_cameras (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_com_semaforo_cam_id DEFAULT NEWID(),
    [nome] NVARCHAR(100) NOT NULL,
    [host] NVARCHAR(255) NOT NULL,
    [porta_onvif] INT NOT NULL CONSTRAINT DF_com_semaforo_cam_porta DEFAULT 80,
    [usuario] NVARCHAR(150) NOT NULL,
    [senha_cifrada] VARBINARY(512) NOT NULL,
    [mediamtx_path] VARCHAR(80) NOT NULL,
    [stream_uri_rtsp] NVARCHAR(500) NULL,
    [perfil_onvif] NVARCHAR(200) NULL,
    [ultima_verificacao_em] DATETIME2 NULL,
    [ultimo_erro_verificacao] NVARCHAR(500) NULL,
    [ativo] BIT NOT NULL CONSTRAINT DF_com_semaforo_cam_ativo DEFAULT 1,
    [ordem] INT NOT NULL CONSTRAINT DF_com_semaforo_cam_ordem DEFAULT 0,
    [criado_em] DATETIME2 NOT NULL CONSTRAINT DF_com_semaforo_cam_criado_em DEFAULT SYSDATETIME(),
    [atualizado_em] DATETIME2 NOT NULL CONSTRAINT DF_com_semaforo_cam_atualizado_em DEFAULT SYSDATETIME(),
    [atualizado_por] NVARCHAR(150) NULL,
    CONSTRAINT PK_com_semaforo_cameras PRIMARY KEY ([id]),
    CONSTRAINT UQ_com_semaforo_cam_mediamtx_path UNIQUE ([mediamtx_path]),
    CONSTRAINT UQ_com_semaforo_cam_nome UNIQUE ([nome])
  );
END;

COMMIT TRANSACTION;
