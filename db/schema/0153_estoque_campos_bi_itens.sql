/*
 * Estoque de Equipamentos: BI de itens (tabela para TV, uma página para
 * usados e outra para novos). Cada campo do tipo de equipamento pode virar
 * uma coluna dessa tabela -- marcado em Administração → Tipos de
 * equipamento ("Mostrar no BI de itens"). Começa desmarcado em todos.
 */
SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.com_estoque_tipos_equipamento_campos') AND name = 'mostrar_bi_itens')
  ALTER TABLE dbo.com_estoque_tipos_equipamento_campos ADD
    [mostrar_bi_itens] BIT NOT NULL CONSTRAINT DF_com_estoque_campos_mostrar_bi_itens DEFAULT 0;

COMMIT TRANSACTION;
GO
