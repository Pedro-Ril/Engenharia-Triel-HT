/*
 * Cadastro de Roteiro: "Roteiro continua válido".
 *
 * Quando a revisão do item muda no 3DEXPERIENCE mas o roteiro de
 * fabricação não precisa mudar, a pessoa valida o roteiro e o Portal só
 * atualiza a revisão das operações no ERP. Esta tabela guarda quem
 * tomou essa decisão, quando, de qual revisão para qual, e o comentário
 * da revisão no 3DX naquele momento -- a decisão não deixa rastro no
 * roteiro em si (as operações continuam iguais).
 */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.portal_roteiro_validacoes_revisao', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_roteiro_validacoes_revisao (
    [id] UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT DF_portal_roteiro_validacoes_revisao_id DEFAULT NEWID()
      CONSTRAINT PK_portal_roteiro_validacoes_revisao PRIMARY KEY,
    [cod_item] NVARCHAR(50) NOT NULL,
    /* Como estava no ERP antes (ex.: "Sem revisão", "A" ou "A, B" quando as operações divergiam). */
    [revisao_anterior] NVARCHAR(100) NOT NULL,
    [revisao_nova] NVARCHAR(20) NOT NULL,
    [comentario_revisao] NVARCHAR(2000) NULL,
    [operacoes] INT NOT NULL,
    [usuario_id] UNIQUEIDENTIFIER NULL
      CONSTRAINT FK_portal_roteiro_validacoes_revisao_usuario REFERENCES dbo.portal_usuarios([id]),
    [usuario_nome] NVARCHAR(200) NOT NULL,
    [criado_em] DATETIME2 NOT NULL
      CONSTRAINT DF_portal_roteiro_validacoes_revisao_criado_em DEFAULT SYSDATETIME()
  );

  CREATE INDEX IX_portal_roteiro_validacoes_revisao_item
    ON dbo.portal_roteiro_validacoes_revisao ([cod_item], [criado_em]);
END;

COMMIT TRANSACTION;
