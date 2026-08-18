/*
  =========================================================
  Portal Triel-HT — IP de origem nas buscas do terminal
  =========================================================

  Adiciona portal_terminal_fabrica_buscas.ip_origem — mesma
  coluna/tamanho de portal_login_historico.ip_origem
  (VARCHAR(64)), só IPv4 (ver normalizarIpv4 em
  src/lib/auth/login-historico.ts, reaproveitado aqui). Útil
  pra identificar qual terminal físico fez a busca quando não
  há usuário logado.

  Execução: manual, direto no SQL Server de destino, depois
  de 0007 já ter rodado.
  `sqlcmd -f i:65001 -i este-arquivo.sql`.
  =========================================================
*/

SET XACT_ABORT ON;

BEGIN TRANSACTION;

IF COL_LENGTH(N'dbo.portal_terminal_fabrica_buscas', N'ip_origem') IS NULL
BEGIN
  ALTER TABLE dbo.portal_terminal_fabrica_buscas
    ADD [ip_origem] VARCHAR(64) NULL;
END;
GO

COMMIT TRANSACTION;
