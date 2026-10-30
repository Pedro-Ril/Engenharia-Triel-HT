/*
 * Equipamentos Usados: integração pelo EXTRATO do item no ERP.
 *
 * Depois que a NF de entrada identifica o equipamento no ERP (código do
 * item + ID da máscara), o Portal passa a ler o extrato de movimentações
 * (GET /api/estoque-usados/extrato da API Oracle) a cada N minutos e o
 * status do equipamento segue o ERP. Só para de consultar quando o
 * equipamento é baixado.
 *
 * - Novo status "em_reforma" (industrialização/reforma, conserto, garantia).
 * - Novos tipos de movimentação no extrato do Portal: "reforma" (saída
 *   para reforma/conserto) e "transferencia" (entre empresas).
 * - Movimentações do Portal ganham a origem (portal/erp) e o vínculo com
 *   a movimentação do ERP que as confirma.
 * - com_estoque_equipamentos_usados_erp_movimentos: cópia de cada
 *   movimentação do extrato do ERP (uma por id estável do ERP).
 * - Equipamento: situação atual segundo o ERP e controle da sincronização.
 * - Config: URLs do extrato e intervalo (padrão 60 min). Sem URL, a
 *   sincronização não roda.
 */
SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

/* ---------- status e tipos ---------- */

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_com_estoque_equip_status')
  ALTER TABLE dbo.com_estoque_equipamentos_usados DROP CONSTRAINT CK_com_estoque_equip_status;
ALTER TABLE dbo.com_estoque_equipamentos_usados ADD CONSTRAINT CK_com_estoque_equip_status
  CHECK ([status] IN ('em_estoque', 'emprestado', 'consignado', 'em_reforma', 'baixado'));

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_com_estoque_mov_tipo_acao')
  ALTER TABLE dbo.com_estoque_equipamentos_usados_movimentacoes DROP CONSTRAINT CK_com_estoque_mov_tipo_acao;
ALTER TABLE dbo.com_estoque_equipamentos_usados_movimentacoes ADD CONSTRAINT CK_com_estoque_mov_tipo_acao
  CHECK ([tipo_acao] IN (N'entrada', N'emprestimo', N'consignacao', N'reforma', N'retorno', N'baixa', N'transferencia', N'nf_vinculada'));

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_com_estoque_nf_logs_tipo_nf')
  ALTER TABLE dbo.com_estoque_integracao_nf_logs DROP CONSTRAINT CK_com_estoque_nf_logs_tipo_nf;
ALTER TABLE dbo.com_estoque_integracao_nf_logs ADD CONSTRAINT CK_com_estoque_nf_logs_tipo_nf
  CHECK ([tipo_nf] IN (N'entrada', N'saida_emprestimo', N'saida_consignacao', N'saida_venda', N'extrato'));

/* ---------- movimentações do Portal: origem e vínculo com o ERP ---------- */

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.com_estoque_equipamentos_usados_movimentacoes') AND name = 'origem')
  ALTER TABLE dbo.com_estoque_equipamentos_usados_movimentacoes
    ADD [origem] VARCHAR(10) NOT NULL CONSTRAINT DF_com_estoque_mov_origem DEFAULT 'portal';

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.com_estoque_equipamentos_usados_movimentacoes') AND name = 'erp_id_movimentacao')
  ALTER TABLE dbo.com_estoque_equipamentos_usados_movimentacoes ADD [erp_id_movimentacao] VARCHAR(40) NULL;

/* ---------- cópia do extrato do ERP ---------- */

IF OBJECT_ID(N'dbo.com_estoque_equipamentos_usados_erp_movimentos', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.com_estoque_equipamentos_usados_erp_movimentos (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_com_estoque_erp_mov_id DEFAULT NEWID()
      CONSTRAINT PK_com_estoque_erp_mov PRIMARY KEY,
    [equipamento_id] UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT FK_com_estoque_erp_mov_equip REFERENCES dbo.com_estoque_equipamentos_usados ([id]) ON DELETE CASCADE,
    [id_movimentacao] VARCHAR(40) NOT NULL,
    [cod_emp] INT NULL,
    [data_movimento] DATE NOT NULL,
    [sentido] VARCHAR(10) NOT NULL,
    [tipo] VARCHAR(40) NOT NULL,
    [modalidade] VARCHAR(30) NULL,
    [nf_numero] VARCHAR(20) NULL,
    [nf_serie] VARCHAR(10) NULL,
    [nf_chave] VARCHAR(60) NULL,
    [nf_situacao] VARCHAR(5) NULL,
    [nf_data_emissao] DATE NULL,
    [cfop] INT NULL,
    [natureza_operacao] NVARCHAR(200) NULL,
    [tipo_nf_descricao] NVARCHAR(200) NULL,
    [contraparte_nome] NVARCHAR(200) NULL,
    [contraparte_cnpj] VARCHAR(20) NULL,
    [almox_origem] NVARCHAR(100) NULL,
    [almox_destino] NVARCHAR(100) NULL,
    [quantidade] DECIMAL(14, 4) NULL,
    [valor_unitario] DECIMAL(14, 2) NULL,
    [valor_total_item] DECIMAL(14, 2) NULL,
    [valor_total_nf] DECIMAL(14, 2) NULL,
    [custo_compra] DECIMAL(14, 2) NULL,
    [valor_estoque] DECIMAL(14, 2) NULL,
    [local_depois] VARCHAR(20) NULL,
    [venda_de_consignacao] BIT NULL,
    [dados] NVARCHAR(MAX) NULL,
    [importado_em] DATETIME2 NOT NULL CONSTRAINT DF_com_estoque_erp_mov_importado DEFAULT SYSDATETIME(),
    [atualizado_em] DATETIME2 NOT NULL CONSTRAINT DF_com_estoque_erp_mov_atualizado DEFAULT SYSDATETIME(),
    /* Sumiu do extrato (NF cancelada no ERP). */
    [removido_em] DATETIME2 NULL,
    CONSTRAINT CK_com_estoque_erp_mov_dados CHECK ([dados] IS NULL OR ISJSON([dados]) = 1)
  );
  CREATE UNIQUE INDEX UX_com_estoque_erp_mov_equip_id
    ON dbo.com_estoque_equipamentos_usados_erp_movimentos ([equipamento_id], [id_movimentacao]);
END;

/* ---------- equipamento: situação no ERP e controle da sincronização ---------- */

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.com_estoque_equipamentos_usados') AND name = 'erp_local')
  ALTER TABLE dbo.com_estoque_equipamentos_usados ADD
    [erp_local] VARCHAR(20) NULL,
    [erp_local_desde] DATE NULL,
    [erp_cod_emp_atual] INT NULL,
    [erp_contraparte_atual] NVARCHAR(200) NULL,
    [erp_custo_compra] DECIMAL(14, 2) NULL,
    [erp_extrato_em] DATETIME2 NULL,
    [erp_extrato_erro] NVARCHAR(500) NULL;

/* ---------- config ---------- */

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.com_estoque_equipamentos_usados_config') AND name = 'url_extrato')
  ALTER TABLE dbo.com_estoque_equipamentos_usados_config ADD
    [url_extrato] NVARCHAR(300) NULL,
    [url_extrato_teste] NVARCHAR(300) NULL,
    [intervalo_extrato_minutos] INT NULL,
    [ultima_execucao_extrato_em] DATETIME2 NULL;

COMMIT TRANSACTION;
