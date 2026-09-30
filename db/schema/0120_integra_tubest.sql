SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- "Integração TuBest": mesma busca por ordem/lote da integração Lantek,
-- mas contra um endpoint próprio do Focco, conferindo a existência do
-- arquivo STEP de cada peça e gerando o XLSX de importação em lote do
-- TuBest (#BatchImportNestPart).
--
-- Config em tabela própria (e não em integra_lantek_config) porque o
-- endpoint, o token e a pasta são outros -- juntar as duas faria a
-- validação de "está tudo configurado?" de um módulo exigir os campos
-- do outro.
IF OBJECT_ID(N'dbo.integra_tubest_config', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.integra_tubest_config (
    [id] INT NOT NULL CONSTRAINT PK_integra_tubest_config PRIMARY KEY,
    [focco_api_base_url] NVARCHAR(300) NULL,
    [focco_api_chave] NVARCHAR(50) NULL,
    [focco_api_token] NVARCHAR(1000) NULL,
    [pasta_step] NVARCHAR(300) NULL,
    [atualizado_em] DATETIME2 NULL,
    [atualizado_por] NVARCHAR(150) NULL
  );
END;

-- A pasta já é conhecida; nasce preenchida para ninguém precisar
-- descobrir o caminho na primeira configuração.
IF NOT EXISTS (SELECT 1 FROM dbo.integra_tubest_config WHERE [id] = 1)
BEGIN
  INSERT INTO dbo.integra_tubest_config ([id], [pasta_step])
  VALUES (1, N'\\servidorgeral\Derivados\Triel-HT\STEP');
END;

-- Nasce com em_desenvolvimento=1: invisível até o admin testar e
-- liberar em Setores e Módulos.
IF NOT EXISTS (SELECT 1 FROM dbo.portal_modulos WHERE [chave] = 'integra-tubest')
BEGIN
  INSERT INTO dbo.portal_modulos
    ([chave], [nome], [path], [icone], [em_desenvolvimento], [ordem])
  VALUES
    ('integra-tubest', N'Integração TuBest', '/integra-tubest', 'FileSpreadsheet', 1, 2);
END;

IF NOT EXISTS (
  SELECT 1 FROM dbo.portal_modulos_setores ms
  INNER JOIN dbo.portal_modulos m ON m.[id] = ms.[modulo_id]
  INNER JOIN dbo.portal_setores s ON s.[id] = ms.[setor_id]
  WHERE m.[chave] = 'integra-tubest' AND s.[chave] = 'pcp'
)
BEGIN
  INSERT INTO dbo.portal_modulos_setores ([modulo_id], [setor_id])
  SELECT m.[id], s.[id]
  FROM dbo.portal_modulos m, dbo.portal_setores s
  WHERE m.[chave] = 'integra-tubest' AND s.[chave] = 'pcp';
END;

COMMIT TRANSACTION;
