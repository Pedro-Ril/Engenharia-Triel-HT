/*
 * Estoque de Equipamentos: tipo de equipamento por condição. Em quais
 * entradas o tipo aparece: 'ambos' (padrão, como todos os que já
 * existem), só 'usado' ou só 'novo'. Mesmo "vale para" dos blocos (0152)
 * e dos campos (0154).
 */
SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.com_estoque_tipos_equipamento') AND name = 'condicao')
  ALTER TABLE dbo.com_estoque_tipos_equipamento ADD
    [condicao] VARCHAR(10) NOT NULL CONSTRAINT DF_com_estoque_tipos_condicao DEFAULT 'ambos'
      CONSTRAINT CK_com_estoque_tipos_condicao CHECK ([condicao] IN ('ambos', 'usado', 'novo'));

COMMIT TRANSACTION;
GO
