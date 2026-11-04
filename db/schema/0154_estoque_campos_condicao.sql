/*
 * Estoque de Equipamentos: campo do tipo por condição (usado/novo).
 *
 * - condicao: para quais equipamentos o campo aparece ('ambos', 'usado',
 *   'novo') -- o mesmo "vale para" que o bloco já tem (0152), agora por
 *   campo. Os campos de sistema (Cliente, Valor...) moram todos no bloco
 *   fixo "Recebimento"; é por aqui que um deles deixa de aparecer no novo.
 * - obrigatorio_novo: obrigatório no equipamento novo. NULL = igual a
 *   "obrigatorio" (que continua valendo para o usado).
 *
 * Já aplica o pedido do Pedro (04/11/2026): no novo, o Cliente não aparece
 * e o Valor não é obrigatório.
 */
SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.com_estoque_tipos_equipamento_campos') AND name = 'condicao')
  ALTER TABLE dbo.com_estoque_tipos_equipamento_campos ADD
    [condicao] VARCHAR(10) NOT NULL CONSTRAINT DF_com_estoque_campos_condicao DEFAULT 'ambos'
      CONSTRAINT CK_com_estoque_campos_condicao CHECK ([condicao] IN ('ambos', 'usado', 'novo'));

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.com_estoque_tipos_equipamento_campos') AND name = 'obrigatorio_novo')
  ALTER TABLE dbo.com_estoque_tipos_equipamento_campos ADD [obrigatorio_novo] BIT NULL;

COMMIT TRANSACTION;
GO

SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

UPDATE dbo.com_estoque_tipos_equipamento_campos
SET [condicao] = 'usado', [atualizado_em] = SYSDATETIME()
WHERE [chave] = 'sistemaNomeCliente' AND [eh_sistema] = 1 AND [condicao] = 'ambos';

UPDATE dbo.com_estoque_tipos_equipamento_campos
SET [obrigatorio_novo] = 0, [atualizado_em] = SYSDATETIME()
WHERE [chave] = 'sistemaValor' AND [eh_sistema] = 1 AND [obrigatorio_novo] IS NULL;

COMMIT TRANSACTION;
GO
