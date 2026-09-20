SET XACT_ABORT ON;
BEGIN TRANSACTION;

/*
 * Lista ÚNICA de redes Wi-Fi, compartilhada por TODOS os terminais da
 * TV Corporativa (decisão explícita -- não é uma lista por terminal).
 * Cada terminal Linux tenta conectar em ordem de [prioridade] até uma
 * funcionar (ver tv-agente/agente.mjs). senha_cifrada usa o mesmo
 * padrão de dbo.com_semaforo_cameras (criptografarSegredo/
 * descriptografarSegredo, ver src/lib/crypto/segredo.ts) -- a senha em
 * claro nunca é gravada nem sai daqui pro cliente admin, só pro
 * próprio agente (ver listarRedesWifiParaAgente).
 */
IF OBJECT_ID(N'dbo.portal_tv_redes_wifi', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_tv_redes_wifi (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_tv_redes_wifi_id DEFAULT NEWID(),
    [ssid] NVARCHAR(64) NOT NULL,
    [senha_cifrada] VARBINARY(512) NOT NULL,
    [prioridade] INT NOT NULL CONSTRAINT DF_tv_redes_wifi_prioridade DEFAULT 0,
    [ativa] BIT NOT NULL CONSTRAINT DF_tv_redes_wifi_ativa DEFAULT 1,
    [criado_em] DATETIME2 NOT NULL CONSTRAINT DF_tv_redes_wifi_criado_em DEFAULT SYSDATETIME(),
    [atualizado_em] DATETIME2 NOT NULL CONSTRAINT DF_tv_redes_wifi_atualizado_em DEFAULT SYSDATETIME(),
    [atualizado_por] NVARCHAR(150) NULL,
    CONSTRAINT PK_tv_redes_wifi PRIMARY KEY ([id]),
    CONSTRAINT UQ_tv_redes_wifi_ssid UNIQUE ([ssid])
  );
END;

COMMIT TRANSACTION;
