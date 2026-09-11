SET XACT_ABORT ON;
BEGIN TRANSACTION;

/*
 * Flag genérica "vem de integração" — substitui a lista fixa que só
 * cobria os 2 campos de sistema de NF/ERP. Agora qualquer campo (de
 * sistema ou dinâmico) pode ser marcado como preenchido por uma
 * integração externa: fica bloqueado pra digitação no cadastro, não
 * pode ser obrigatório, e ganha um indicador visual na lista de campos.
 */
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.com_estoque_tipos_equipamento_campos') AND name = 'vem_de_integracao'
)
BEGIN
  ALTER TABLE dbo.com_estoque_tipos_equipamento_campos
    ADD [vem_de_integracao] BIT NOT NULL CONSTRAINT DF_com_estoque_campos_vem_integracao DEFAULT (0);
END;

COMMIT TRANSACTION;
GO

SET XACT_ABORT ON;
BEGIN TRANSACTION;

/*
 * Os 2 campos de sistema que já eram bloqueados via lista fixa
 * (CHAVES_SISTEMA_INTEGRACAO_NF, removida) passam a usar a flag —
 * mantém o comportamento atual, agora editável pelo admin em vez de
 * hardcoded.
 */
UPDATE dbo.com_estoque_tipos_equipamento_campos
SET [vem_de_integracao] = 1
WHERE [chave] IN (N'sistemaNumeroNfEntrada', N'sistemaErpCodigoItem') AND [vem_de_integracao] = 0;

COMMIT TRANSACTION;
GO

SET XACT_ABORT ON;
BEGIN TRANSACTION;

/*
 * Correção: o "mascara" (número do carro) da consulta de NF de entrada é
 * o Nº sequencial do próprio equipamento, não um campo de texto como
 * "Número de série" — era o palpite inicial, confirmado errado. A partir
 * daqui o padrão (e o valor já configurado, já que ninguém tinha mudado
 * ainda) passa a ser o sentinela "numeroSequencial" (ver
 * CHAVE_MASCARA_NUMERO_SEQUENCIAL em constants.ts).
 */
IF EXISTS (
  SELECT 1 FROM sys.default_constraints
  WHERE name = 'DF_com_estoque_config_campo_mascara'
)
BEGIN
  ALTER TABLE dbo.com_estoque_equipamentos_usados_config DROP CONSTRAINT DF_com_estoque_config_campo_mascara;
END;

ALTER TABLE dbo.com_estoque_equipamentos_usados_config
  ADD CONSTRAINT DF_com_estoque_config_campo_mascara DEFAULT (N'numeroSequencial') FOR [campo_mascara_chave];

UPDATE dbo.com_estoque_equipamentos_usados_config
SET [campo_mascara_chave] = N'numeroSequencial'
WHERE [id] = 1 AND [campo_mascara_chave] = N'sistemaNumeroSerie';

COMMIT TRANSACTION;
