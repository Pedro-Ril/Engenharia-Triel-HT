SET XACT_ABORT ON;
BEGIN TRANSACTION;

/*
 * Guarda o código do cliente (cod_cli) selecionado no autocomplete de
 * Cliente — até aqui só a descrição era salva (nome_cliente), mas o job
 * de busca automática de NF de entrada precisa do código pra montar o
 * parâmetro cod_for da consulta no ERP.
 */
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.com_estoque_equipamentos_usados') AND name = 'codigo_cliente'
)
BEGIN
  ALTER TABLE dbo.com_estoque_equipamentos_usados ADD [codigo_cliente] NVARCHAR(30) NULL;
END;

COMMIT TRANSACTION;
GO

SET XACT_ABORT ON;
BEGIN TRANSACTION;

/*
 * Campos "NF de entrada" e "Código do item no ERP" deixam de ser
 * digitáveis no cadastro (passam a ser preenchidos pelo job de
 * integração) — um campo marcado como obrigatório e impossível de
 * digitar travaria o formulário pra sempre, então qualquer tipo que já
 * tinha um dos dois marcado como obrigatório é corrigido aqui.
 */
UPDATE dbo.com_estoque_tipos_equipamento_campos
SET [obrigatorio] = 0
WHERE [chave] IN (N'sistemaNumeroNfEntrada', N'sistemaErpCodigoItem') AND [obrigatorio] = 1;

COMMIT TRANSACTION;
GO

SET XACT_ABORT ON;
BEGIN TRANSACTION;

/*
 * Config do job de busca automática de NF de entrada — mesma tabela de
 * config (id=1) já usada pra validação de item/URL de clientes
 * (com_estoque_equipamentos_usados_config), só com mais colunas.
 * campo_mascara_chave é o "de-para": qual campo de sistema do
 * equipamento alimenta o parâmetro `mascara` (o Focco chama de "número
 * do carro") — o valor mais provável já vem como padrão (Número de
 * série), mas fica editável em Administração caso esteja errado.
 */
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.com_estoque_equipamentos_usados_config') AND name = 'url_nf_entrada'
)
BEGIN
  ALTER TABLE dbo.com_estoque_equipamentos_usados_config ADD [url_nf_entrada] NVARCHAR(300) NULL;
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.com_estoque_equipamentos_usados_config') AND name = 'url_nf_entrada_teste'
)
BEGIN
  ALTER TABLE dbo.com_estoque_equipamentos_usados_config ADD [url_nf_entrada_teste] NVARCHAR(300) NULL;
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.com_estoque_equipamentos_usados_config') AND name = 'intervalo_verificacao_nf_minutos'
)
BEGIN
  ALTER TABLE dbo.com_estoque_equipamentos_usados_config
    ADD [intervalo_verificacao_nf_minutos] INT NOT NULL CONSTRAINT DF_com_estoque_config_intervalo_nf DEFAULT (5);
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.com_estoque_equipamentos_usados_config') AND name = 'campo_mascara_chave'
)
BEGIN
  ALTER TABLE dbo.com_estoque_equipamentos_usados_config
    ADD [campo_mascara_chave] NVARCHAR(50) NOT NULL CONSTRAINT DF_com_estoque_config_campo_mascara DEFAULT (N'sistemaNumeroSerie');
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.com_estoque_equipamentos_usados_config') AND name = 'ultima_execucao_nf_em'
)
BEGIN
  ALTER TABLE dbo.com_estoque_equipamentos_usados_config ADD [ultima_execucao_nf_em] DATETIME2 NULL;
END;

COMMIT TRANSACTION;
GO

SET XACT_ABORT ON;
BEGIN TRANSACTION;

/*
 * Histórico de tentativas do job (sucesso/erro/não encontrado ainda) —
 * é o que alimenta o botão "Tentativas de integração" na tela do
 * equipamento. Cascade: some junto se o equipamento for excluído.
 */
IF OBJECT_ID(N'dbo.com_estoque_integracao_nf_logs', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.com_estoque_integracao_nf_logs (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_com_estoque_nf_logs_id DEFAULT NEWID() PRIMARY KEY,
    [equipamento_id] UNIQUEIDENTIFIER NOT NULL,
    [iniciado_em] DATETIME2 NOT NULL CONSTRAINT DF_com_estoque_nf_logs_iniciado DEFAULT SYSDATETIME(),
    [finalizado_em] DATETIME2 NULL,
    [status] NVARCHAR(20) NOT NULL CONSTRAINT CK_com_estoque_nf_logs_status
      CHECK ([status] IN (N'sucesso', N'nao_encontrado', N'erro')),
    [mensagem] NVARCHAR(500) NULL,
    [parametros_consulta] NVARCHAR(300) NULL,
    [disparado_por] NVARCHAR(150) NULL,
    CONSTRAINT FK_com_estoque_nf_logs_equipamento FOREIGN KEY ([equipamento_id])
      REFERENCES dbo.com_estoque_equipamentos_usados([id]) ON DELETE CASCADE
  );

  CREATE INDEX IX_com_estoque_nf_logs_equipamento ON dbo.com_estoque_integracao_nf_logs([equipamento_id], [iniciado_em] DESC);
END;

COMMIT TRANSACTION;
