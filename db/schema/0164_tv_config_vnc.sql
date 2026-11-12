/*
 * Acesso remoto (VNC) aos terminais Linux da TV Corporativa. Senha
 * única para todos os terminais, cifrada com o mesmo esquema das
 * senhas de Wi-Fi (src/lib/crypto/segredo.ts). NULL = VNC desligado.
 * Só o agente do terminal recebe a senha decifrada (GET
 * /api/tv/agente/config, autenticado pelo token do terminal) -- nunca
 * o instalador, que é rota pública. Ver tv-agente/agente.mjs.
 */
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.portal_tv_config') AND name = 'vnc_senha_cifrada'
)
BEGIN
  ALTER TABLE dbo.portal_tv_config ADD [vnc_senha_cifrada] VARBINARY(512) NULL;
END;

COMMIT TRANSACTION;
