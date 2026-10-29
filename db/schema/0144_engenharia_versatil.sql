/*
 * Engenharia Versátil -- fase 1: separação da engenharia de um projeto.
 *
 * O usuário sobe a planilha do projeto ("1111 - CAÇAMBA ... .xls"); o
 * número antes do hífen acha a pasta do projeto na rede; cada aba da
 * planilha (menos as da blacklist) vira uma subpasta, e os desenhos dos
 * itens são copiados das pastas de origem (PDF em todas, DXF só nas abas
 * configuradas). Nada é sobrescrito nem apagado no destino.
 *
 * - eng_versatil_config: singleton (id = 1) com as pastas e as listas,
 *   editado em Administração > Configurações > Engenharia Versátil.
 *   Listas guardadas uma por linha.
 * - eng_versatil_separacoes / _itens: o registro de cada execução e de
 *   cada arquivo (copiado, já existia, não encontrado, erro).
 *
 * O módulo nasce em desenvolvimento (só administrador vê) e ligado à
 * Engenharia de Produto.
 *
 * Aplicar com sqlcmd -f 65001 (há texto acentuado nos literais).
 */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.eng_versatil_config', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.eng_versatil_config (
    [id] INT NOT NULL CONSTRAINT PK_eng_versatil_config PRIMARY KEY
      CONSTRAINT CK_eng_versatil_config_id CHECK ([id] = 1),
    [pasta_projetos] NVARCHAR(300) NULL,
    [pasta_pdf] NVARCHAR(300) NULL,
    [pasta_dxf] NVARCHAR(300) NULL,
    /* Abas que não viram pasta (uma por linha). */
    [abas_blacklist] NVARCHAR(2000) NULL,
    /* Abas que recebem DXF além do PDF (uma por linha). */
    [abas_com_dxf] NVARCHAR(2000) NULL,
    [atualizado_em] DATETIME2 NULL,
    [atualizado_por] NVARCHAR(150) NULL
  );
END;

IF NOT EXISTS (SELECT 1 FROM dbo.eng_versatil_config WHERE [id] = 1)
  INSERT INTO dbo.eng_versatil_config
    ([id], [pasta_projetos], [pasta_pdf], [pasta_dxf], [abas_blacklist], [abas_com_dxf], [atualizado_em], [atualizado_por])
  VALUES (
    1,
    N'\\servidorgeral\Versatil\Publico\PROJETOS GERAL',
    N'\\oracle2\docs\DESENHOS_VERSATIL',
    N'\\oracle2\docs\DXF_VERSATIL',
    N'original' + NCHAR(10) + N'MESTRA',
    N'CHAPARIA',
    SYSDATETIME(),
    N'migracao-0144'
  );

IF OBJECT_ID(N'dbo.eng_versatil_separacoes', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.eng_versatil_separacoes (
    [id] UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT DF_eng_versatil_separacoes_id DEFAULT NEWID()
      CONSTRAINT PK_eng_versatil_separacoes PRIMARY KEY,
    [numero_projeto] NVARCHAR(30) NOT NULL,
    [arquivo_planilha] NVARCHAR(300) NOT NULL,
    [pasta_projeto] NVARCHAR(500) NULL,
    /* executando | concluida | erro */
    [status] VARCHAR(20) NOT NULL,
    [pastas_criadas] INT NOT NULL CONSTRAINT DF_eng_versatil_separacoes_pastas DEFAULT 0,
    [arquivos_copiados] INT NOT NULL CONSTRAINT DF_eng_versatil_separacoes_copiados DEFAULT 0,
    [arquivos_ja_existiam] INT NOT NULL CONSTRAINT DF_eng_versatil_separacoes_existiam DEFAULT 0,
    [arquivos_nao_encontrados] INT NOT NULL CONSTRAINT DF_eng_versatil_separacoes_nao_encontrados DEFAULT 0,
    [arquivos_com_erro] INT NOT NULL CONSTRAINT DF_eng_versatil_separacoes_erros DEFAULT 0,
    [mensagem] NVARCHAR(2000) NULL,
    [usuario_id] UNIQUEIDENTIFIER NULL
      CONSTRAINT FK_eng_versatil_separacoes_usuario REFERENCES dbo.portal_usuarios([id]),
    [usuario_nome] NVARCHAR(200) NOT NULL,
    [criado_em] DATETIME2 NOT NULL
      CONSTRAINT DF_eng_versatil_separacoes_criado_em DEFAULT SYSDATETIME(),
    [finalizado_em] DATETIME2 NULL
  );

  CREATE INDEX IX_eng_versatil_separacoes_criado_em ON dbo.eng_versatil_separacoes ([criado_em] DESC);
END;

IF OBJECT_ID(N'dbo.eng_versatil_separacoes_itens', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.eng_versatil_separacoes_itens (
    [id] UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT DF_eng_versatil_separacoes_itens_id DEFAULT NEWID()
      CONSTRAINT PK_eng_versatil_separacoes_itens PRIMARY KEY,
    [separacao_id] UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT FK_eng_versatil_separacoes_itens_separacao REFERENCES dbo.eng_versatil_separacoes([id]),
    [ordem] INT NOT NULL,
    [aba] NVARCHAR(100) NOT NULL,
    /* Pasta de destino relativa à pasta do projeto (ex.: USINAGEM\USINAGEM COMUM). */
    [pasta_destino] NVARCHAR(300) NOT NULL,
    [codigo] NVARCHAR(50) NOT NULL,
    /* pdf | dxf */
    [tipo] VARCHAR(5) NOT NULL,
    [arquivo] NVARCHAR(260) NULL,
    /* copiado | ja_existia | nao_encontrado | erro */
    [acao] VARCHAR(20) NOT NULL,
    [mensagem] NVARCHAR(1000) NULL,
    [criado_em] DATETIME2 NOT NULL
      CONSTRAINT DF_eng_versatil_separacoes_itens_criado_em DEFAULT SYSDATETIME()
  );

  CREATE INDEX IX_eng_versatil_separacoes_itens_separacao ON dbo.eng_versatil_separacoes_itens ([separacao_id], [ordem]);
END;

IF NOT EXISTS (SELECT 1 FROM dbo.portal_modulos WHERE [chave] = 'engenharia-versatil')
  INSERT INTO dbo.portal_modulos
    ([chave], [nome], [path], [icone], [em_desenvolvimento], [ordem])
  VALUES
    ('engenharia-versatil', N'Engenharia Versátil', '/engenharia-versatil', 'FolderTree', 1,
     (SELECT ISNULL(MAX([ordem]), 0) + 1 FROM dbo.portal_modulos));

INSERT INTO dbo.portal_modulos_setores ([modulo_id], [setor_id])
SELECT m.[id], s.[id]
FROM dbo.portal_modulos AS m
CROSS JOIN dbo.portal_setores AS s
WHERE m.[chave] = 'engenharia-versatil'
  AND s.[chave] = 'eng-prod-agro'
  AND NOT EXISTS (
    SELECT 1 FROM dbo.portal_modulos_setores AS ms
    WHERE ms.[modulo_id] = m.[id] AND ms.[setor_id] = s.[id]
  );

COMMIT TRANSACTION;
