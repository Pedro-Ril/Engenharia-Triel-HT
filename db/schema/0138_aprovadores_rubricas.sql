/*
 * Rubricas dos aprovadores: um PNG por pessoa, enviado pela
 * administração (Diretoria → Alçadas). O Portal estampa a rubrica de
 * quem aprovou cada nível no rodapé do PDF do pedido de compra quando
 * o PDF é aberto -- o arquivo original da pasta do Suprimentos não muda.
 *
 * A imagem fica no banco (não numa pasta compartilhada): só sai de lá
 * dentro do PDF de um pedido que a pessoa pode ver, ou na prévia da
 * administração.
 */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.portal_aprovadores_rubricas', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_aprovadores_rubricas (
    [usuario_id] UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT PK_portal_aprovadores_rubricas PRIMARY KEY
      CONSTRAINT FK_portal_aprovadores_rubricas_usuario REFERENCES dbo.portal_usuarios([id]),
    [imagem] VARBINARY(MAX) NOT NULL,
    [largura] INT NOT NULL,
    [altura] INT NOT NULL,
    [tamanho] INT NOT NULL,
    [atualizado_em] DATETIME2 NOT NULL
      CONSTRAINT DF_portal_aprovadores_rubricas_atualizado_em DEFAULT SYSDATETIME(),
    [atualizado_por] NVARCHAR(200) NULL
  );
END;

COMMIT TRANSACTION;
