/*
 * "Bloco" deixa de ser um enum fixo (VARCHAR + CHECK, igual pra qualquer
 * tipo de equipamento) e passa a ser uma entidade filha de cada tipo,
 * administrável como os campos já são — inclusive o bloco "Recebimento"
 * (antes fixo/oculto), que agora nasce junto com o tipo mas pode ser
 * renomeado/reordenado (nunca excluído, nunca recebe campo dinâmico).
 *
 * Já existe dado real (não é só teste): confirmado via sqlcmd antes desta
 * migração — 2 tipos ("Silo Graneleiro", "Suínos") e 12 campos reais, o
 * usuário já vinha cadastrando pelo admin. Os passos abaixo preservam
 * tudo isso: criam os 4 blocos "de sempre" (Recebimento + os 3 antigos)
 * pra cada tipo já existente, e migram cada campo pro bloco_id
 * correspondente ao valor antigo de `bloco` antes de derrubar a coluna.
 *
 * Usa GO entre "ADD COLUMN" e qualquer statement seguinte que referencie
 * essa coluna nova — dentro do mesmo batch (sem GO), o SQL Server não
 * reconhece a coluna recém-criada por uma ALTER TABLE anterior no mesmo
 * batch (mesmo problema já visto na migração 0074 com campos_valores).
 * A transação aberta com BEGIN TRANSACTION continua válida através dos
 * GO — é só um separador de batch do lado do cliente (sqlcmd), não um
 * limite de transação.
 */

SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.com_estoque_tipos_equipamento_blocos', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.com_estoque_tipos_equipamento_blocos (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_com_estoque_tipo_bloco_id DEFAULT NEWID(),
    [tipo_equipamento_id] UNIQUEIDENTIFIER NOT NULL,
    [nome] NVARCHAR(100) NOT NULL,
    [eh_fixo] BIT NOT NULL CONSTRAINT DF_com_estoque_tipo_bloco_eh_fixo DEFAULT 0,
    [ordem] INT NOT NULL CONSTRAINT DF_com_estoque_tipo_bloco_ordem DEFAULT 0,
    [ativo] BIT NOT NULL CONSTRAINT DF_com_estoque_tipo_bloco_ativo DEFAULT 1,
    [criado_em] DATETIME2 NOT NULL CONSTRAINT DF_com_estoque_tipo_bloco_criado_em DEFAULT SYSDATETIME(),
    [atualizado_em] DATETIME2 NOT NULL CONSTRAINT DF_com_estoque_tipo_bloco_atualizado_em DEFAULT SYSDATETIME(),
    CONSTRAINT PK_com_estoque_tipos_equipamento_blocos PRIMARY KEY ([id]),
    CONSTRAINT FK_com_estoque_tipo_bloco_tipo FOREIGN KEY ([tipo_equipamento_id])
      REFERENCES dbo.com_estoque_tipos_equipamento ([id]) ON DELETE CASCADE,
    CONSTRAINT UQ_com_estoque_tipo_bloco_nome UNIQUE ([tipo_equipamento_id], [nome])
  );
END;
GO

/*
 * Semeia os 4 blocos "de sempre" (Recebimento + os 3 antigos) pra todo
 * tipo já existente que ainda não tenha blocos (idempotente).
 */
INSERT INTO dbo.com_estoque_tipos_equipamento_blocos ([tipo_equipamento_id], [nome], [eh_fixo], [ordem])
SELECT t.[id], v.[nome], v.[eh_fixo], v.[ordem]
FROM dbo.com_estoque_tipos_equipamento AS t
CROSS JOIN (VALUES
  (N'Recebimento', 1, 0),
  (N'Informações técnicas', 0, 1),
  (N'Estado de conservação', 0, 2),
  (N'Observações gerais', 0, 3)
) AS v ([nome], [eh_fixo], [ordem])
WHERE NOT EXISTS (
  SELECT 1 FROM dbo.com_estoque_tipos_equipamento_blocos AS b
  WHERE b.[tipo_equipamento_id] = t.[id]
);
GO

-- ===== com_estoque_tipos_equipamento_campos: bloco (texto) -> bloco_id (FK) =====

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.com_estoque_tipos_equipamento_campos') AND name = 'bloco_id')
BEGIN
  ALTER TABLE dbo.com_estoque_tipos_equipamento_campos ADD [bloco_id] UNIQUEIDENTIFIER NULL;
END;
GO

UPDATE c
SET c.[bloco_id] = b.[id]
FROM dbo.com_estoque_tipos_equipamento_campos AS c
INNER JOIN dbo.com_estoque_tipos_equipamento_blocos AS b
  ON b.[tipo_equipamento_id] = c.[tipo_equipamento_id]
 AND (
   (c.[bloco] = 'tecnicas' AND b.[nome] = N'Informações técnicas') OR
   (c.[bloco] = 'conservacao' AND b.[nome] = N'Estado de conservação') OR
   (c.[bloco] = 'observacoes' AND b.[nome] = N'Observações gerais')
 )
WHERE c.[bloco_id] IS NULL;

IF EXISTS (SELECT 1 FROM dbo.com_estoque_tipos_equipamento_campos WHERE [bloco_id] IS NULL)
BEGIN
  ;THROW 50001, 'Sobrou campo sem bloco_id migrado — corrigir antes de continuar.', 1;
END;
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.com_estoque_tipos_equipamento_campos') AND name = 'bloco')
BEGIN
  ALTER TABLE dbo.com_estoque_tipos_equipamento_campos DROP CONSTRAINT CK_com_estoque_tipo_campo_bloco;
  ALTER TABLE dbo.com_estoque_tipos_equipamento_campos DROP COLUMN [bloco];
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.com_estoque_tipos_equipamento_campos') AND name = 'bloco_id' AND is_nullable = 0)
BEGIN
  ALTER TABLE dbo.com_estoque_tipos_equipamento_campos ALTER COLUMN [bloco_id] UNIQUEIDENTIFIER NOT NULL;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_com_estoque_tipo_campo_bloco')
BEGIN
  ALTER TABLE dbo.com_estoque_tipos_equipamento_campos
    ADD CONSTRAINT FK_com_estoque_tipo_campo_bloco FOREIGN KEY ([bloco_id])
      REFERENCES dbo.com_estoque_tipos_equipamento_blocos ([id]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_com_estoque_tipo_campo_bloco' AND object_id = OBJECT_ID(N'dbo.com_estoque_tipos_equipamento_campos'))
BEGIN
  CREATE INDEX IX_com_estoque_tipo_campo_bloco ON dbo.com_estoque_tipos_equipamento_campos ([tipo_equipamento_id], [bloco_id]);
END;
GO

-- ===== com_estoque_equipamentos_usados_evidencias: bloco (texto) -> bloco_id (FK) =====
-- Sem dado real nesta tabela (confirmado 0 linhas) — coluna + FK juntas numa
-- ALTER TABLE só (evita depender de GO pra essa troca).

IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_com_estoque_evid_equipamento_bloco' AND object_id = OBJECT_ID(N'dbo.com_estoque_equipamentos_usados_evidencias'))
BEGIN
  DROP INDEX IX_com_estoque_evid_equipamento_bloco ON dbo.com_estoque_equipamentos_usados_evidencias;
END;

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.com_estoque_equipamentos_usados_evidencias') AND name = 'bloco')
BEGIN
  ALTER TABLE dbo.com_estoque_equipamentos_usados_evidencias DROP CONSTRAINT CK_com_estoque_evid_bloco;
  ALTER TABLE dbo.com_estoque_equipamentos_usados_evidencias DROP COLUMN [bloco];
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.com_estoque_equipamentos_usados_evidencias') AND name = 'bloco_id')
BEGIN
  ALTER TABLE dbo.com_estoque_equipamentos_usados_evidencias
    ADD [bloco_id] UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT FK_com_estoque_evid_bloco FOREIGN KEY REFERENCES dbo.com_estoque_tipos_equipamento_blocos ([id]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_com_estoque_evid_equipamento_bloco' AND object_id = OBJECT_ID(N'dbo.com_estoque_equipamentos_usados_evidencias'))
BEGIN
  CREATE INDEX IX_com_estoque_evid_equipamento_bloco ON dbo.com_estoque_equipamentos_usados_evidencias ([equipamento_id], [bloco_id]);
END;
GO

COMMIT TRANSACTION;
