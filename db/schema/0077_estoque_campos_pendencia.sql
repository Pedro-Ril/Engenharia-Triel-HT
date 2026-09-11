SET XACT_ABORT ON;
BEGIN TRANSACTION;

/*
 * "gera_pendencia": flag por campo (só faz sentido pra campo opcional —
 * checado na aplicação) que marca se, quando o valor fica em branco num
 * equipamento, isso deve contar como uma pendência exibida/filtrável na
 * lista de estoque (ex: "Sem NF de entrada"). Fica de fora dos campos
 * obrigatórios porque esses nunca ficam vazios (bloqueado no cadastro).
 */
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.com_estoque_tipos_equipamento_campos') AND name = 'gera_pendencia'
)
BEGIN
  ALTER TABLE dbo.com_estoque_tipos_equipamento_campos
    ADD [gera_pendencia] BIT NOT NULL CONSTRAINT DF_com_estoque_tipos_equip_campos_gera_pendencia DEFAULT 0;
END;

/*
 * NF de entrada deixa de ser sempre obrigatória — passa a poder ficar em
 * branco (aí "gera_pendencia" entra em ação pra sinalizar/filtrar quem
 * está sem nota de recebimento). Tabela ainda sem equipamentos reais
 * (0 linhas, conferido antes de aplicar), então não há dado existente
 * pra migrar.
 */
IF EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'com_estoque_equipamentos_usados' AND COLUMN_NAME = 'numero_nf_entrada' AND IS_NULLABLE = 'NO'
)
BEGIN
  ALTER TABLE dbo.com_estoque_equipamentos_usados ALTER COLUMN [numero_nf_entrada] NVARCHAR(30) NULL;
END;

COMMIT TRANSACTION;
