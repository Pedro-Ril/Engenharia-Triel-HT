SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- Data de admissão do colaborador, copiada do RH (GER_FUNCIONARIO.
-- FUN_DTADM) na hora da solicitação. É snapshot como o resto dos dados
-- do colaborador: o que vale é como estava quando o pedido foi feito.
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.portal_aprovacoes_aumento_salarial')
    AND name = 'data_admissao'
)
BEGIN
  ALTER TABLE dbo.portal_aprovacoes_aumento_salarial
    ADD [data_admissao] DATE NULL;
END;

-- Configuração do módulo: para onde vai o relatório que o solicitante
-- dispara quando a solicitação termina. Linha única (id=1), mesmo molde
-- de dbo.portal_chamados_config.
IF OBJECT_ID(N'dbo.portal_aprovacoes_config', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_aprovacoes_config (
    [id] INT NOT NULL CONSTRAINT PK_portal_aprovacoes_config PRIMARY KEY,
    [email_relatorio] NVARCHAR(200) NULL,
    [atualizado_em] DATETIME2 NULL,
    [atualizado_por] NVARCHAR(200) NULL
  );

  INSERT INTO dbo.portal_aprovacoes_config ([id], [email_relatorio]) VALUES (1, NULL);
END;

COMMIT TRANSACTION;
