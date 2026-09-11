SET XACT_ABORT ON;
BEGIN TRANSACTION;

/*
 * Documento anexado a uma ação do estrato (empréstimo, consignação,
 * retorno, baixa) — ex: contrato de empréstimo, nota fiscal da baixa.
 * Mesmo desenho de com_estoque_equipamentos_usados_evidencias (arquivo
 * gravado direto na linha), só que ligado a uma movimentação em vez de
 * um bloco do equipamento. CASCADE a partir de movimentacoes (que já
 * cascade a partir do equipamento) — apagar o equipamento já limpa tudo
 * numa penada só, sem precisar de limpeza manual em múltiplas tabelas.
 */
IF OBJECT_ID(N'dbo.com_estoque_movimentacoes_anexos', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.com_estoque_movimentacoes_anexos (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_com_estoque_mov_anexos_id DEFAULT NEWID(),
    [movimentacao_id] UNIQUEIDENTIFIER NOT NULL,
    [nome_arquivo] NVARCHAR(260) NOT NULL,
    [tipo_mime] VARCHAR(100) NOT NULL,
    [tamanho_bytes] INT NOT NULL,
    [conteudo] VARBINARY(MAX) NOT NULL,
    [criado_por_usuario_id] UNIQUEIDENTIFIER NOT NULL,
    [criado_por_nome] NVARCHAR(150) NOT NULL,
    [criado_em] DATETIME2 NOT NULL CONSTRAINT DF_com_estoque_mov_anexos_criado_em DEFAULT SYSDATETIME(),
    CONSTRAINT PK_com_estoque_mov_anexos PRIMARY KEY ([id]),
    CONSTRAINT FK_com_estoque_mov_anexos_mov FOREIGN KEY ([movimentacao_id])
      REFERENCES dbo.com_estoque_equipamentos_usados_movimentacoes ([id]) ON DELETE CASCADE
  );

  CREATE INDEX IX_com_estoque_mov_anexos_movimentacao ON dbo.com_estoque_movimentacoes_anexos ([movimentacao_id]);
END;

COMMIT TRANSACTION;
