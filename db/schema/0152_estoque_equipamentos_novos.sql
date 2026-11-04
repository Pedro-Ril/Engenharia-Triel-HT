/*
 * Estoque de Equipamentos: além dos usados, equipamentos NOVOS (fabricação
 * interna) no mesmo módulo.
 *
 * - condicao no equipamento: 'usado' (todos os que já existem) ou 'novo'.
 * - Numeração: o usado continua com o número automático (IDENTITY); o
 *   novo tem numeração própria por tipo de equipamento, digitada na
 *   entrada (pode repetir o número de um usado). A unicidade global do
 *   número vira duas: usados entre si e novos por tipo.
 * - condicao no bloco do tipo: para quais equipamentos o bloco vale
 *   ('ambos', 'usado' ou 'novo'). "Estado de conservação" passa a valer
 *   só para usados.
 */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.com_estoque_equipamentos_usados') AND name = 'condicao')
  ALTER TABLE dbo.com_estoque_equipamentos_usados ADD
    [condicao] VARCHAR(10) NOT NULL CONSTRAINT DF_com_estoque_equip_condicao DEFAULT 'usado'
      CONSTRAINT CK_com_estoque_equip_condicao CHECK ([condicao] IN ('usado', 'novo'));

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.com_estoque_tipos_equipamento_blocos') AND name = 'condicao')
  ALTER TABLE dbo.com_estoque_tipos_equipamento_blocos ADD
    [condicao] VARCHAR(10) NOT NULL CONSTRAINT DF_com_estoque_blocos_condicao DEFAULT 'ambos'
      CONSTRAINT CK_com_estoque_blocos_condicao CHECK ([condicao] IN ('ambos', 'usado', 'novo'));

COMMIT TRANSACTION;
GO

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

UPDATE dbo.com_estoque_tipos_equipamento_blocos
SET [condicao] = 'usado', [atualizado_em] = SYSDATETIME()
WHERE [nome] = N'Estado de conservação' AND [eh_fixo] = 0 AND [condicao] = 'ambos';

IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'UQ_com_estoque_equip_numero' AND parent_object_id = OBJECT_ID(N'dbo.com_estoque_equipamentos_usados'))
  ALTER TABLE dbo.com_estoque_equipamentos_usados DROP CONSTRAINT UQ_com_estoque_equip_numero;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_com_estoque_equip_numero_usado' AND object_id = OBJECT_ID(N'dbo.com_estoque_equipamentos_usados'))
  CREATE UNIQUE INDEX UX_com_estoque_equip_numero_usado
    ON dbo.com_estoque_equipamentos_usados ([numero])
    WHERE [condicao] = 'usado';

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_com_estoque_equip_numero_novo' AND object_id = OBJECT_ID(N'dbo.com_estoque_equipamentos_usados'))
  CREATE UNIQUE INDEX UX_com_estoque_equip_numero_novo
    ON dbo.com_estoque_equipamentos_usados ([tipo_equipamento_id], [numero])
    WHERE [condicao] = 'novo';

COMMIT TRANSACTION;
GO
