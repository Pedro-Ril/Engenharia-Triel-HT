SET XACT_ABORT ON;
BEGIN TRANSACTION;

/*
 * "ID Configurado" (erp_id_item) e "Data Entrada NF" (erp_data_entrada)
 * viram campos de sistema de verdade (chave própria, gerenciáveis pelo
 * admin como os outros 10) em vez de InfoCampo hardcoded na tela de
 * detalhe — motivo: apareciam duplicados com campos dinâmicos que o
 * usuário criou pra tentar cobrir a mesma necessidade, sem saber que já
 * existia um campo interno pra isso. criarTipoEquipamento já semeia os
 * dois em qualquer tipo novo (DEFINICOES_CAMPOS_SISTEMA); este backfill
 * cobre os tipos já existentes.
 */
INSERT INTO dbo.com_estoque_tipos_equipamento_campos
  ([tipo_equipamento_id], [bloco_id], [chave], [rotulo], [tipo_dado], [unidade], [obrigatorio], [ordem], [eh_sistema], [vem_de_integracao])
SELECT
  b.[tipo_equipamento_id],
  b.[id],
  N'sistemaIdConfigurado',
  N'ID Configurado',
  N'texto',
  NULL,
  0,
  ISNULL((SELECT MAX(c2.[ordem]) FROM dbo.com_estoque_tipos_equipamento_campos c2 WHERE c2.[bloco_id] = b.[id]), -1) + 1,
  1,
  1
FROM dbo.com_estoque_tipos_equipamento_blocos b
WHERE b.[eh_fixo] = 1
  AND NOT EXISTS (
    SELECT 1 FROM dbo.com_estoque_tipos_equipamento_campos c3
    WHERE c3.[bloco_id] = b.[id] AND c3.[chave] = N'sistemaIdConfigurado'
  );

INSERT INTO dbo.com_estoque_tipos_equipamento_campos
  ([tipo_equipamento_id], [bloco_id], [chave], [rotulo], [tipo_dado], [unidade], [obrigatorio], [ordem], [eh_sistema], [vem_de_integracao])
SELECT
  b.[tipo_equipamento_id],
  b.[id],
  N'sistemaDataEntradaNf',
  N'Data Entrada NF',
  N'data',
  NULL,
  0,
  ISNULL((SELECT MAX(c2.[ordem]) FROM dbo.com_estoque_tipos_equipamento_campos c2 WHERE c2.[bloco_id] = b.[id]), -1) + 1,
  1,
  1
FROM dbo.com_estoque_tipos_equipamento_blocos b
WHERE b.[eh_fixo] = 1
  AND NOT EXISTS (
    SELECT 1 FROM dbo.com_estoque_tipos_equipamento_campos c3
    WHERE c3.[bloco_id] = b.[id] AND c3.[chave] = N'sistemaDataEntradaNf'
  );

COMMIT TRANSACTION;
