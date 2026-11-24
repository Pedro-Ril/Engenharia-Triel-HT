/*
 * Plugins 3DX: relatório diário de uso por e-mail (PDF + Excel), evento "relatorio_diario" (aviso geral, sem plugin).
 *
 * - portal_3dx_plugins_relatorios: um registro por dia de referência + escopo enviado. É o que impede envio repetido
 *   (vários servidores do Portal podem rodar o agendador: quem inserir primeiro envia -- UNIQUE abaixo) e guarda o
 *   resultado de cada envio, mostrado em Administração > Plugins 3DX > Ações.
 *   escopo: AMBOS (destinatário sem ambiente), PRODUCAO ou TESTE (destinatário de um ambiente só).
 *
 * Aplicar com: sqlcmd -S pdmserver -U sa -d PortalTrielHT -C -f 65001 -i db/schema/0176_plugins_3dx_relatorios.sql
 */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.portal_3dx_plugins_relatorios', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_3dx_plugins_relatorios (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_portal_3dx_plugins_relatorios_id DEFAULT NEWID()
      CONSTRAINT PK_portal_3dx_plugins_relatorios PRIMARY KEY,
    [data_referencia] DATE NOT NULL,
    [escopo] VARCHAR(10) NOT NULL
      CONSTRAINT CK_portal_3dx_plugins_relatorios_escopo CHECK ([escopo] IN ('AMBOS', 'PRODUCAO', 'TESTE')),
    /* pendente: reservado por um servidor e ainda enviando; enviado; falha (tenta de novo até 3 vezes) */
    [situacao] VARCHAR(10) NOT NULL CONSTRAINT DF_portal_3dx_plugins_relatorios_situacao DEFAULT 'pendente'
      CONSTRAINT CK_portal_3dx_plugins_relatorios_situacao CHECK ([situacao] IN ('pendente', 'enviado', 'falha')),
    [tentativas] INT NOT NULL CONSTRAINT DF_portal_3dx_plugins_relatorios_tentativas DEFAULT 1,
    [destinatarios] NVARCHAR(MAX) NULL,
    [total_execucoes] INT NULL,
    [erro] NVARCHAR(1000) NULL,
    [criado_em] DATETIME2 NOT NULL CONSTRAINT DF_portal_3dx_plugins_relatorios_criado_em DEFAULT SYSDATETIME(),
    [atualizado_em] DATETIME2 NOT NULL CONSTRAINT DF_portal_3dx_plugins_relatorios_atualizado_em DEFAULT SYSDATETIME(),
    CONSTRAINT UQ_portal_3dx_plugins_relatorios_dia UNIQUE ([data_referencia], [escopo])
  );
END;

COMMIT TRANSACTION;
