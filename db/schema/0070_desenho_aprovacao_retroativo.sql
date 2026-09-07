/*
 * Migração retroativa — documenta o schema de "Desenho de Aprovação" que já
 * existe no banco real, mas nunca foi commitado como migração (db/schema/ é
 * untracked pelo git e já sumiu antes nesta sessão). Todas as tabelas abaixo
 * JÁ EXISTEM em produção; este script é idempotente (IF OBJECT_ID ... IS NULL)
 * e não deve alterar nada ao rodar contra o banco real — só recria a partir
 * do zero se algum dia o banco precisar ser reconstruído de db/schema/.
 *
 * Dois grupos de tabelas:
 * 1) eng_desenhos_aprovacao* — os desenhos em si (8 reais hoje), já usados
 *    por todas as rotas de src/app/api/desenho-aprovacao (e sub-rotas).
 * 2) eng_templates_aprovacao* — sistema de templates dinâmicos, criado em
 *    02/08/2026 mas nunca conectado a nenhum código até esta entrega.
 *    eng_templates_aprovacao_bloqueios/_autosalvamentos/_componentes*
 *    ficam documentadas aqui mas fora de uso nesta entrega (0 linhas reais,
 *    funcionalidades avançadas — lock de edição concorrente, autosave,
 *    componentes reutilizáveis — que o sistema básico não precisa).
 */

SET XACT_ABORT ON;
BEGIN TRANSACTION;

/* ==================== GRUPO 1: eng_desenhos_aprovacao* ==================== */

IF OBJECT_ID(N'dbo.eng_desenhos_aprovacao', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.eng_desenhos_aprovacao (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_eng_desenhos_aprovacao PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [sequencial] BIGINT NOT NULL IDENTITY(1,1),
    [numero] AS ('DA-' + RIGHT('000000' + CONVERT(VARCHAR(20), [sequencial]), 6)) PERSISTED,
    [cliente] NVARCHAR(200) NULL,
    [produto] NVARCHAR(200) NULL,
    [modelo] NVARCHAR(100) NULL,
    [caminhao] NVARCHAR(150) NULL,
    [cabine] NVARCHAR(100) NULL,
    [comprimento] DECIMAL(12,2) NULL CONSTRAINT CK_eng_desenhos_aprovacao_comprimento CHECK ([comprimento] IS NULL OR [comprimento] >= 0),
    [altura] DECIMAL(12,2) NULL CONSTRAINT CK_eng_desenhos_aprovacao_altura CHECK ([altura] IS NULL OR [altura] >= 0),
    [capacidade_ton] DECIMAL(12,2) NULL CONSTRAINT CK_eng_desenhos_aprovacao_capacidade_ton CHECK ([capacidade_ton] IS NULL OR [capacidade_ton] >= 0),
    [volume_m3] DECIMAL(12,2) NULL CONSTRAINT CK_eng_desenhos_aprovacao_volume_m3 CHECK ([volume_m3] IS NULL OR [volume_m3] >= 0),
    [compartimentos] INT NULL CONSTRAINT CK_eng_desenhos_aprovacao_compartimentos CHECK ([compartimentos] IS NULL OR [compartimentos] >= 0),
    [peso] DECIMAL(12,2) NULL CONSTRAINT CK_eng_desenhos_aprovacao_peso CHECK ([peso] IS NULL OR [peso] >= 0),
    [carga_dianteira] DECIMAL(5,2) NULL CONSTRAINT CK_eng_desenhos_aprovacao_carga_dianteira CHECK ([carga_dianteira] IS NULL OR [carga_dianteira] >= 0 AND [carga_dianteira] <= 100),
    [carga_traseira] DECIMAL(5,2) NULL CONSTRAINT CK_eng_desenhos_aprovacao_carga_traseira CHECK ([carga_traseira] IS NULL OR [carga_traseira] >= 0 AND [carga_traseira] <= 100),
    [observacoes] NVARCHAR(MAX) NULL,
    [status] VARCHAR(30) NOT NULL CONSTRAINT DF_eng_desenhos_aprovacao_status DEFAULT 'rascunho'
      CONSTRAINT CK_eng_desenhos_aprovacao_status CHECK ([status] IN ('rascunho','em_aprovacao','pendente','aprovado','reprovado')),
    [tipo_representacao] VARCHAR(20) NOT NULL CONSTRAINT DF_eng_desenhos_aprovacao_tipo_representacao DEFAULT 'completo'
      CONSTRAINT CK_eng_desenhos_aprovacao_tipo_representacao CHECK ([tipo_representacao] IN ('lateral','superior','completo')),
    [data_emissao] DATE NULL,
    [previsao_aprovacao] DATE NULL,
    [incluir_cotas] BIT NOT NULL CONSTRAINT DF_eng_desenhos_aprovacao_incluir_cotas DEFAULT 1,
    [calculo_automatico] BIT NOT NULL CONSTRAINT DF_eng_desenhos_aprovacao_calculo_automatico DEFAULT 1,
    [incluir_caminhao] BIT NOT NULL CONSTRAINT DF_eng_desenhos_aprovacao_incluir_caminhao DEFAULT 0,
    [ativo] BIT NOT NULL CONSTRAINT DF_eng_desenhos_aprovacao_ativo DEFAULT 1,
    [criado_em] DATETIME2 NOT NULL CONSTRAINT DF_eng_desenhos_aprovacao_criado_em DEFAULT SYSDATETIME(),
    [criado_por] NVARCHAR(300) NULL,
    [atualizado_em] DATETIME2 NOT NULL CONSTRAINT DF_eng_desenhos_aprovacao_atualizado_em DEFAULT SYSDATETIME(),
    [atualizado_por] NVARCHAR(300) NULL,
    [excluido_em] DATETIME2 NULL,
    [excluido_por] NVARCHAR(300) NULL,
    [versao] ROWVERSION NOT NULL,
    [revisao_atual_id] UNIQUEIDENTIFIER NULL,
    CONSTRAINT UQ_eng_desenhos_aprovacao_sequencial UNIQUE ([sequencial]),
    CONSTRAINT UX_eng_desenhos_aprovacao_numero UNIQUE ([numero]),
    -- pré-requisito da FK composta de eng_desenhos_aprovacao_revisoes -> aqui
    CONSTRAINT UQ_eng_desenhos_aprovacao_id_check UNIQUE ([id])
  );

  CREATE NONCLUSTERED INDEX IX_eng_desenhos_aprovacao_status_ativo ON dbo.eng_desenhos_aprovacao ([status], [ativo]);
  CREATE NONCLUSTERED INDEX IX_eng_desenhos_aprovacao_cliente ON dbo.eng_desenhos_aprovacao ([cliente]);
  CREATE NONCLUSTERED INDEX IX_eng_desenhos_aprovacao_produto ON dbo.eng_desenhos_aprovacao ([produto]);
END;

IF OBJECT_ID(N'dbo.eng_desenhos_aprovacao_revisoes', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.eng_desenhos_aprovacao_revisoes (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_eng_desenhos_aprovacao_revisoes PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [desenho_id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_eng_desenhos_revisoes_desenho REFERENCES dbo.eng_desenhos_aprovacao([id]),
    [numero_revisao] INT NOT NULL CONSTRAINT CK_eng_desenhos_revisoes_numero CHECK ([numero_revisao] >= 0),
    [codigo_revisao] VARCHAR(10) NOT NULL,
    [status_revisao] VARCHAR(30) NOT NULL CONSTRAINT DF_eng_desenhos_revisoes_status DEFAULT 'gerando'
      CONSTRAINT CK_eng_desenhos_revisoes_status CHECK ([status_revisao] IN ('gerando','gerado','em_aprovacao','ajustes_solicitados','aprovado','reprovado','erro')),
    [dados_json] NVARCHAR(MAX) NOT NULL CONSTRAINT CK_eng_desenhos_revisoes_dados_json CHECK (ISJSON([dados_json]) = 1),
    [parametros_json] NVARCHAR(MAX) NULL CONSTRAINT CK_eng_desenhos_revisoes_parametros_json CHECK ([parametros_json] IS NULL OR ISJSON([parametros_json]) = 1),
    [template_codigo] VARCHAR(100) NOT NULL,
    [template_versao] INT NOT NULL CONSTRAINT DF_eng_desenhos_revisoes_template_versao DEFAULT 1,
    [gerador_versao] VARCHAR(50) NOT NULL CONSTRAINT DF_eng_desenhos_revisoes_gerador_versao DEFAULT '1.0.0',
    [svg_conteudo] NVARCHAR(MAX) NULL,
    [pdf_caminho] NVARCHAR(1000) NULL,
    [erro_geracao] NVARCHAR(MAX) NULL,
    [criado_em] DATETIME2 NOT NULL CONSTRAINT DF_eng_desenhos_revisoes_criado_em DEFAULT SYSDATETIME(),
    [criado_por] NVARCHAR(300) NOT NULL,
    [gerado_em] DATETIME2 NULL,
    [gerado_por] NVARCHAR(300) NULL,
    [enviado_aprovacao_em] DATETIME2 NULL,
    [enviado_aprovacao_por] NVARCHAR(300) NULL,
    [decidido_em] DATETIME2 NULL,
    [decidido_por] NVARCHAR(300) NULL,
    [observacao_decisao] NVARCHAR(MAX) NULL,
    -- ligação com o sistema de templates dinâmicos (Fases 4+) — nulo pra
    -- revisões que usam o gerador hardcoded (ex: Silo Graneleiro hoje)
    [template_id] UNIQUEIDENTIFIER NULL,
    [template_versao_id] UNIQUEIDENTIFIER NULL,
    [template_snapshot_json] NVARCHAR(MAX) NULL CONSTRAINT CK_eng_desenhos_revisoes_template_snapshot_json CHECK ([template_snapshot_json] IS NULL OR ISJSON([template_snapshot_json]) = 1),
    CONSTRAINT CK_eng_desenhos_revisoes_template_relacao CHECK (
      [template_id] IS NULL AND [template_versao_id] IS NULL
      OR [template_id] IS NOT NULL AND [template_versao_id] IS NOT NULL
    ),
    CONSTRAINT UQ_eng_desenhos_revisoes_id_desenho UNIQUE ([id], [desenho_id]),
    CONSTRAINT UQ_eng_desenhos_revisoes_codigo UNIQUE ([desenho_id], [codigo_revisao]),
    CONSTRAINT UQ_eng_desenhos_revisoes_numero UNIQUE ([desenho_id], [numero_revisao])
  );

  CREATE NONCLUSTERED INDEX IX_eng_desenhos_revisoes_desenho ON dbo.eng_desenhos_aprovacao_revisoes ([desenho_id]);
  CREATE NONCLUSTERED INDEX IX_eng_desenhos_revisoes_status ON dbo.eng_desenhos_aprovacao_revisoes ([status_revisao]);
END;

-- FKs circulares (desenho <-> revisão atual), adicionadas só depois que as duas tabelas existem
IF OBJECT_ID(N'dbo.eng_desenhos_aprovacao', N'U') IS NOT NULL
  AND OBJECT_ID(N'dbo.eng_desenhos_aprovacao_revisoes', N'U') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_eng_desenhos_aprovacao_revisao_atual')
BEGIN
  ALTER TABLE dbo.eng_desenhos_aprovacao
    ADD CONSTRAINT FK_eng_desenhos_aprovacao_revisao_atual
    FOREIGN KEY ([revisao_atual_id], [id])
    REFERENCES dbo.eng_desenhos_aprovacao_revisoes ([id], [desenho_id]);
END;

IF OBJECT_ID(N'dbo.eng_desenhos_aprovacao_historico', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.eng_desenhos_aprovacao_historico (
    [id] BIGINT NOT NULL IDENTITY(1,1) CONSTRAINT PK_eng_desenhos_aprovacao_historico PRIMARY KEY,
    [desenho_id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_eng_desenhos_aprovacao_historico_desenho REFERENCES dbo.eng_desenhos_aprovacao([id]),
    [acao] VARCHAR(40) NOT NULL CONSTRAINT CK_eng_desenhos_aprovacao_historico_acao CHECK ([acao] IN (
      'CRIADO','ATUALIZADO','STATUS_ALTERADO','REVISAO_CRIADA','DESENHO_GERADO',
      'ENVIADO_APROVACAO','APROVADO','REPROVADO','AJUSTES_SOLICITADOS','REABERTO_REVISAO','EXCLUIDO'
    )),
    [status_anterior] VARCHAR(30) NULL,
    [status_novo] VARCHAR(30) NULL,
    [observacao] NVARCHAR(2000) NULL,
    [dados_json] NVARCHAR(MAX) NULL CONSTRAINT CK_eng_desenhos_aprovacao_historico_json CHECK ([dados_json] IS NULL OR ISJSON([dados_json]) = 1),
    [usuario] NVARCHAR(300) NULL,
    [criado_em] DATETIME2 NOT NULL CONSTRAINT DF_eng_desenhos_aprovacao_historico_criado_em DEFAULT SYSDATETIME()
  );

  CREATE NONCLUSTERED INDEX IX_eng_desenhos_aprovacao_historico_desenho ON dbo.eng_desenhos_aprovacao_historico ([desenho_id]);
END;

/* Nunca usada por código nenhum até hoje — documentada por completude. */
IF OBJECT_ID(N'dbo.eng_desenhos_aprovacao_anexos', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.eng_desenhos_aprovacao_anexos (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_eng_desenhos_aprovacao_anexos PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [desenho_id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_eng_desenhos_aprovacao_anexos_desenho REFERENCES dbo.eng_desenhos_aprovacao([id]),
    [nome_original] NVARCHAR(260) NOT NULL,
    [nome_armazenado] NVARCHAR(260) NULL,
    [extensao] NVARCHAR(20) NULL,
    [tipo_mime] NVARCHAR(150) NULL,
    [tamanho_bytes] BIGINT NOT NULL CONSTRAINT CK_eng_desenhos_aprovacao_anexos_tamanho CHECK ([tamanho_bytes] >= 0),
    [caminho_arquivo] NVARCHAR(1000) NOT NULL,
    [hash_sha256] CHAR(64) NULL,
    [ativo] BIT NOT NULL CONSTRAINT DF_eng_desenhos_aprovacao_anexos_ativo DEFAULT 1,
    [criado_em] DATETIME2 NOT NULL CONSTRAINT DF_eng_desenhos_aprovacao_anexos_criado_em DEFAULT SYSDATETIME(),
    [criado_por] NVARCHAR(300) NULL,
    [excluido_em] DATETIME2 NULL,
    [excluido_por] NVARCHAR(300) NULL,
    [versao] ROWVERSION NOT NULL
  );

  CREATE NONCLUSTERED INDEX IX_eng_desenhos_aprovacao_anexos_desenho ON dbo.eng_desenhos_aprovacao_anexos ([desenho_id]);
END;

/* ==================== GRUPO 2: eng_templates_aprovacao* ==================== */

IF OBJECT_ID(N'dbo.eng_templates_aprovacao', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.eng_templates_aprovacao (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_eng_templates_aprovacao PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [sequencial] BIGINT NOT NULL IDENTITY(1,1),
    [codigo] AS ('TPL-' + RIGHT('000000' + CONVERT(VARCHAR(20), [sequencial]), 6)) PERSISTED,
    [nome] NVARCHAR(400) NOT NULL CONSTRAINT CK_eng_templates_aprovacao_nome CHECK (LEN(LTRIM(RTRIM([nome]))) >= 3),
    [descricao] NVARCHAR(2000) NULL,
    [formato_papel] VARCHAR(20) NOT NULL CONSTRAINT DF_eng_templates_aprovacao_formato DEFAULT 'A3'
      CONSTRAINT CK_eng_templates_aprovacao_formato CHECK ([formato_papel] IN ('A0','A1','A2','A3','A4','custom')),
    [orientacao] VARCHAR(20) NOT NULL CONSTRAINT DF_eng_templates_aprovacao_orientacao DEFAULT 'horizontal'
      CONSTRAINT CK_eng_templates_aprovacao_orientacao CHECK ([orientacao] IN ('horizontal','vertical')),
    [largura_mm] DECIMAL(10,3) NOT NULL CONSTRAINT DF_eng_templates_aprovacao_largura DEFAULT 420,
    [altura_mm] DECIMAL(10,3) NOT NULL CONSTRAINT DF_eng_templates_aprovacao_altura DEFAULT 297,
    CONSTRAINT CK_eng_templates_aprovacao_dimensoes CHECK ([largura_mm] > 0 AND [altura_mm] > 0),
    [unidade] VARCHAR(10) NOT NULL CONSTRAINT DF_eng_templates_aprovacao_unidade DEFAULT 'mm'
      CONSTRAINT CK_eng_templates_aprovacao_unidade CHECK ([unidade] = 'mm'),
    [status] VARCHAR(30) NOT NULL CONSTRAINT DF_eng_templates_aprovacao_status DEFAULT 'ativo'
      CONSTRAINT CK_eng_templates_aprovacao_status CHECK ([status] IN ('ativo','arquivado')),
    [versao_publicada_id] UNIQUEIDENTIFIER NULL,
    [ativo] BIT NOT NULL CONSTRAINT DF_eng_templates_aprovacao_ativo DEFAULT 1,
    [criado_em] DATETIME2(3) NOT NULL CONSTRAINT DF_eng_templates_aprovacao_criado_em DEFAULT SYSDATETIME(),
    [criado_por] NVARCHAR(300) NOT NULL,
    [atualizado_em] DATETIME2(3) NOT NULL CONSTRAINT DF_eng_templates_aprovacao_atualizado_em DEFAULT SYSDATETIME(),
    [atualizado_por] NVARCHAR(300) NOT NULL,
    [row_version] ROWVERSION NOT NULL,
    CONSTRAINT UQ_eng_templates_aprovacao_codigo UNIQUE ([codigo]),
    CONSTRAINT UQ_eng_templates_aprovacao_id_check UNIQUE ([id])
  );

  CREATE NONCLUSTERED INDEX IX_eng_templates_aprovacao_status_ativo ON dbo.eng_templates_aprovacao
    ([status], [ativo], [codigo], [nome], [versao_publicada_id], [atualizado_em]);
END;

IF OBJECT_ID(N'dbo.eng_templates_aprovacao_versoes', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.eng_templates_aprovacao_versoes (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_eng_templates_aprovacao_versoes PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [template_id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_eng_templates_aprovacao_versoes_template REFERENCES dbo.eng_templates_aprovacao([id]),
    [numero_versao] INT NOT NULL CONSTRAINT CK_eng_templates_aprovacao_versoes_numero CHECK ([numero_versao] >= 1),
    [status] VARCHAR(30) NOT NULL CONSTRAINT DF_eng_templates_aprovacao_versoes_status DEFAULT 'rascunho'
      CONSTRAINT CK_eng_templates_aprovacao_versoes_status CHECK ([status] IN ('rascunho','em_teste','publicado','arquivado')),
    [template_json] NVARCHAR(MAX) NOT NULL CONSTRAINT CK_eng_templates_aprovacao_versoes_template_json CHECK (ISJSON([template_json]) = 1),
    [renderer_json] NVARCHAR(MAX) NULL CONSTRAINT CK_eng_templates_aprovacao_versoes_renderer_json CHECK ([renderer_json] IS NULL OR ISJSON([renderer_json]) = 1),
    [svg_preview] NVARCHAR(MAX) NULL,
    [validacao_json] NVARCHAR(MAX) NULL CONSTRAINT CK_eng_templates_aprovacao_versoes_validacao_json CHECK ([validacao_json] IS NULL OR ISJSON([validacao_json]) = 1),
    [observacao] NVARCHAR(4000) NULL,
    [criado_em] DATETIME2(3) NOT NULL CONSTRAINT DF_eng_templates_aprovacao_versoes_criado_em DEFAULT SYSDATETIME(),
    [criado_por] NVARCHAR(300) NOT NULL,
    [atualizado_em] DATETIME2(3) NOT NULL CONSTRAINT DF_eng_templates_aprovacao_versoes_atualizado_em DEFAULT SYSDATETIME(),
    [atualizado_por] NVARCHAR(300) NOT NULL,
    [publicado_em] DATETIME2(3) NULL,
    [publicado_por] NVARCHAR(300) NULL,
    [arquivado_em] DATETIME2(3) NULL,
    [arquivado_por] NVARCHAR(300) NULL,
    [row_version] ROWVERSION NOT NULL,
    CONSTRAINT CK_eng_templates_aprovacao_versoes_publicacao CHECK ([status] <> 'publicado' OR [publicado_em] IS NOT NULL AND [publicado_por] IS NOT NULL),
    CONSTRAINT UQ_eng_templates_aprovacao_versoes_numero UNIQUE ([template_id], [numero_versao]),
    CONSTRAINT UQ_eng_templates_aprovacao_versoes_template_id_id UNIQUE ([template_id], [id])
  );

  CREATE NONCLUSTERED INDEX IX_eng_templates_versoes_template_status ON dbo.eng_templates_aprovacao_versoes
    ([atualizado_em], [atualizado_por], [publicado_em], [template_id], [status], [numero_versao]);
END;

IF OBJECT_ID(N'dbo.eng_templates_aprovacao', N'U') IS NOT NULL
  AND OBJECT_ID(N'dbo.eng_templates_aprovacao_versoes', N'U') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_eng_templates_aprovacao_versao_publicada')
BEGIN
  ALTER TABLE dbo.eng_templates_aprovacao
    ADD CONSTRAINT FK_eng_templates_aprovacao_versao_publicada
    FOREIGN KEY ([versao_publicada_id], [id])
    REFERENCES dbo.eng_templates_aprovacao_versoes ([id], [template_id]);
END;

-- FKs de eng_desenhos_aprovacao_revisoes -> sistema de templates (composta, garante consistência template_id/versao_id)
IF OBJECT_ID(N'dbo.eng_desenhos_aprovacao_revisoes', N'U') IS NOT NULL
  AND OBJECT_ID(N'dbo.eng_templates_aprovacao', N'U') IS NOT NULL
  AND OBJECT_ID(N'dbo.eng_templates_aprovacao_versoes', N'U') IS NOT NULL
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_eng_desenhos_revisoes_template')
    ALTER TABLE dbo.eng_desenhos_aprovacao_revisoes
      ADD CONSTRAINT FK_eng_desenhos_revisoes_template FOREIGN KEY ([template_id]) REFERENCES dbo.eng_templates_aprovacao([id]);

  IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_eng_desenhos_revisoes_template_versao')
    ALTER TABLE dbo.eng_desenhos_aprovacao_revisoes
      ADD CONSTRAINT FK_eng_desenhos_revisoes_template_versao FOREIGN KEY ([template_versao_id], [template_id])
      REFERENCES dbo.eng_templates_aprovacao_versoes([id], [template_id]);
END;

IF OBJECT_ID(N'dbo.eng_templates_aprovacao_campos_dinamicos', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.eng_templates_aprovacao_campos_dinamicos (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_eng_templates_aprovacao_campos_dinamicos PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [chave] VARCHAR(100) NOT NULL,
    [rotulo] NVARCHAR(300) NOT NULL,
    [categoria] VARCHAR(50) NOT NULL CONSTRAINT CK_eng_templates_campos_dinamicos_categoria CHECK ([categoria] IN (
      'identificacao','cliente','produto','dimensoes','capacidade','cargas','revisao','auditoria','outro'
    )),
    [tipo_dado] VARCHAR(30) NOT NULL CONSTRAINT CK_eng_templates_campos_dinamicos_tipo CHECK ([tipo_dado] IN ('texto','numero','booleano','data')),
    [formato_padrao] VARCHAR(100) NULL,
    [unidade_padrao] VARCHAR(30) NULL,
    [valor_exemplo] NVARCHAR(600) NULL,
    [descricao] NVARCHAR(2000) NULL,
    [ordem] INT NOT NULL CONSTRAINT DF_eng_templates_campos_dinamicos_ordem DEFAULT 100,
    [ativo] BIT NOT NULL CONSTRAINT DF_eng_templates_campos_dinamicos_ativo DEFAULT 1,
    [criado_em] DATETIME2(3) NOT NULL CONSTRAINT DF_eng_templates_campos_dinamicos_criado_em DEFAULT SYSDATETIME(),
    [criado_por] NVARCHAR(300) NOT NULL,
    [atualizado_em] DATETIME2(3) NOT NULL CONSTRAINT DF_eng_templates_campos_dinamicos_atualizado_em DEFAULT SYSDATETIME(),
    [atualizado_por] NVARCHAR(300) NOT NULL,
    CONSTRAINT UQ_eng_templates_aprovacao_campos_dinamicos_chave UNIQUE ([chave])
  );
END;

IF OBJECT_ID(N'dbo.eng_templates_aprovacao_vinculos', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.eng_templates_aprovacao_vinculos (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_eng_templates_aprovacao_vinculos PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [template_id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_eng_templates_aprovacao_vinculos_template REFERENCES dbo.eng_templates_aprovacao([id]),
    [produto] NVARCHAR(300) NOT NULL CONSTRAINT CK_eng_templates_aprovacao_vinculos_produto CHECK (LEN(LTRIM(RTRIM([produto]))) >= 2),
    [modelo] NVARCHAR(300) NULL,
    [modelo_chave] AS (ISNULL([modelo], N'')) PERSISTED,
    [padrao] BIT NOT NULL CONSTRAINT DF_eng_templates_aprovacao_vinculos_padrao DEFAULT 0,
    [prioridade] INT NOT NULL CONSTRAINT DF_eng_templates_aprovacao_vinculos_prioridade DEFAULT 100
      CONSTRAINT CK_eng_templates_aprovacao_vinculos_prioridade CHECK ([prioridade] >= 0),
    [vigencia_inicio] DATETIME2 NULL,
    [vigencia_fim] DATETIME2 NULL,
    CONSTRAINT CK_eng_templates_aprovacao_vinculos_vigencia CHECK ([vigencia_fim] IS NULL OR [vigencia_inicio] IS NULL OR [vigencia_fim] > [vigencia_inicio]),
    [ativo] BIT NOT NULL CONSTRAINT DF_eng_templates_aprovacao_vinculos_ativo DEFAULT 1,
    [criado_em] DATETIME2 NOT NULL CONSTRAINT DF_eng_templates_aprovacao_vinculos_criado_em DEFAULT SYSDATETIME(),
    [criado_por] NVARCHAR(300) NOT NULL,
    [atualizado_em] DATETIME2 NOT NULL CONSTRAINT DF_eng_templates_aprovacao_vinculos_atualizado_em DEFAULT SYSDATETIME(),
    [atualizado_por] NVARCHAR(300) NOT NULL,
    CONSTRAINT UX_eng_templates_vinculos_padrao UNIQUE ([produto], [modelo_chave])
  );

  CREATE NONCLUSTERED INDEX IX_eng_templates_vinculos_resolucao ON dbo.eng_templates_aprovacao_vinculos
    ([template_id], [vigencia_inicio], [vigencia_fim], [produto], [modelo_chave], [ativo], [padrao], [prioridade]);
END;

IF OBJECT_ID(N'dbo.eng_templates_aprovacao_assets', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.eng_templates_aprovacao_assets (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_eng_templates_aprovacao_assets PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [escopo] VARCHAR(20) NOT NULL CONSTRAINT DF_eng_templates_aprovacao_assets_escopo DEFAULT 'template'
      CONSTRAINT CK_eng_templates_aprovacao_assets_escopo CHECK ([escopo] IN ('global','template','versao')),
    [template_id] UNIQUEIDENTIFIER NULL,
    [versao_id] UNIQUEIDENTIFIER NULL,
    CONSTRAINT CK_eng_templates_aprovacao_assets_escopo_relacoes CHECK (
      [escopo] = 'global' AND [template_id] IS NULL AND [versao_id] IS NULL
      OR [escopo] = 'template' AND [template_id] IS NOT NULL AND [versao_id] IS NULL
      OR [escopo] = 'versao' AND [template_id] IS NOT NULL AND [versao_id] IS NOT NULL
    ),
    [nome] NVARCHAR(400) NOT NULL,
    [tipo] VARCHAR(30) NOT NULL CONSTRAINT CK_eng_templates_aprovacao_assets_tipo CHECK ([tipo] IN ('svg','imagem','icone','logo','legenda','outro')),
    [mime_type] VARCHAR(150) NOT NULL CONSTRAINT CK_eng_templates_aprovacao_assets_mime CHECK ([mime_type] IN ('image/svg+xml','image/png','image/jpeg','image/webp')),
    [armazenamento] VARCHAR(20) NOT NULL CONSTRAINT DF_eng_templates_aprovacao_assets_armazenamento DEFAULT 'banco'
      CONSTRAINT CK_eng_templates_aprovacao_assets_armazenamento CHECK ([armazenamento] IN ('banco','arquivo')),
    [conteudo] VARBINARY(MAX) NULL,
    [caminho] NVARCHAR(2000) NULL,
    CONSTRAINT CK_eng_templates_aprovacao_assets_conteudo CHECK (
      [armazenamento] = 'banco' AND [conteudo] IS NOT NULL AND [caminho] IS NULL
      OR [armazenamento] = 'arquivo' AND [conteudo] IS NULL AND [caminho] IS NOT NULL
    ),
    [tamanho_bytes] BIGINT NOT NULL CONSTRAINT CK_eng_templates_aprovacao_assets_tamanho CHECK ([tamanho_bytes] > 0),
    [hash_sha256] CHAR(64) NOT NULL CONSTRAINT CK_eng_templates_aprovacao_assets_hash CHECK (LEN([hash_sha256]) = 64),
    [largura_px] INT NULL,
    [altura_px] INT NULL,
    CONSTRAINT CK_eng_templates_aprovacao_assets_dimensoes CHECK (([largura_px] IS NULL OR [largura_px] > 0) AND ([altura_px] IS NULL OR [altura_px] > 0)),
    [viewbox] VARCHAR(200) NULL,
    [metadados_json] NVARCHAR(MAX) NULL CONSTRAINT CK_eng_templates_aprovacao_assets_metadados CHECK ([metadados_json] IS NULL OR ISJSON([metadados_json]) = 1),
    -- obrigatório por constraint: nenhum SVG entra sem passar pela sanitização
    [svg_sanitizado] BIT NOT NULL CONSTRAINT DF_eng_templates_aprovacao_assets_svg_sanitizado DEFAULT 0,
    [ativo] BIT NOT NULL CONSTRAINT DF_eng_templates_aprovacao_assets_ativo DEFAULT 1,
    [criado_em] DATETIME2(3) NOT NULL CONSTRAINT DF_eng_templates_aprovacao_assets_criado_em DEFAULT SYSDATETIME(),
    [criado_por] NVARCHAR(300) NOT NULL,
    [atualizado_em] DATETIME2(3) NOT NULL CONSTRAINT DF_eng_templates_aprovacao_assets_atualizado_em DEFAULT SYSDATETIME(),
    [atualizado_por] NVARCHAR(300) NOT NULL,
    CONSTRAINT CK_eng_templates_aprovacao_assets_svg_sanitizado CHECK ([mime_type] <> 'image/svg+xml' OR [svg_sanitizado] = 1),
    CONSTRAINT FK_eng_templates_aprovacao_assets_template FOREIGN KEY ([template_id]) REFERENCES dbo.eng_templates_aprovacao([id]),
    CONSTRAINT FK_eng_templates_aprovacao_assets_versao FOREIGN KEY ([versao_id], [template_id]) REFERENCES dbo.eng_templates_aprovacao_versoes([id], [template_id])
  );

  CREATE NONCLUSTERED INDEX IX_eng_templates_assets_hash ON dbo.eng_templates_aprovacao_assets ([hash_sha256], [ativo]);
  CREATE NONCLUSTERED INDEX IX_eng_templates_assets_template_ativo ON dbo.eng_templates_aprovacao_assets
    ([nome], [mime_type], [tamanho_bytes], [hash_sha256], [versao_id], [template_id], [ativo], [tipo]);
END;

IF OBJECT_ID(N'dbo.eng_templates_aprovacao_historico', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.eng_templates_aprovacao_historico (
    [id] BIGINT NOT NULL IDENTITY(1,1) CONSTRAINT PK_eng_templates_aprovacao_historico PRIMARY KEY,
    [template_id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_eng_templates_historico_template REFERENCES dbo.eng_templates_aprovacao([id]),
    [versao_id] UNIQUEIDENTIFIER NULL,
    [acao] VARCHAR(80) NOT NULL,
    [status_anterior] VARCHAR(30) NULL,
    [status_novo] VARCHAR(30) NULL,
    [observacao] NVARCHAR(4000) NULL,
    [dados_json] NVARCHAR(MAX) NULL CONSTRAINT CK_eng_templates_historico_dados_json CHECK ([dados_json] IS NULL OR ISJSON([dados_json]) = 1),
    [usuario] NVARCHAR(300) NOT NULL,
    [criado_em] DATETIME2(3) NOT NULL CONSTRAINT DF_eng_templates_historico_criado_em DEFAULT SYSDATETIME(),
    CONSTRAINT FK_eng_templates_historico_versao FOREIGN KEY ([versao_id], [template_id]) REFERENCES dbo.eng_templates_aprovacao_versoes([id], [template_id])
  );

  CREATE NONCLUSTERED INDEX IX_eng_templates_historico_template_data ON dbo.eng_templates_aprovacao_historico
    ([versao_id], [acao], [usuario], [status_anterior], [status_novo], [template_id], [criado_em]);
END;

/* ---- Fora de escopo nesta entrega (0 linhas reais hoje), documentadas por completude ---- */

IF OBJECT_ID(N'dbo.eng_templates_aprovacao_bloqueios', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.eng_templates_aprovacao_bloqueios (
    [versao_id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_eng_templates_aprovacao_bloqueios PRIMARY KEY,
    [template_id] UNIQUEIDENTIFIER NOT NULL,
    [sessao_id] UNIQUEIDENTIFIER NOT NULL,
    [usuario] NVARCHAR(300) NOT NULL,
    [bloqueado_em] DATETIME2(3) NOT NULL CONSTRAINT DF_eng_templates_bloqueios_bloqueado_em DEFAULT SYSDATETIME(),
    [expira_em] DATETIME2(3) NOT NULL,
    [renovado_em] DATETIME2(3) NOT NULL CONSTRAINT DF_eng_templates_bloqueios_renovado_em DEFAULT SYSDATETIME(),
    CONSTRAINT CK_eng_templates_bloqueios_expiracao CHECK ([expira_em] > [bloqueado_em]),
    CONSTRAINT UQ_eng_templates_aprovacao_bloqueios_sessao UNIQUE ([sessao_id]),
    CONSTRAINT FK_eng_templates_bloqueios_versao FOREIGN KEY ([versao_id], [template_id]) REFERENCES dbo.eng_templates_aprovacao_versoes([id], [template_id])
  );

  CREATE NONCLUSTERED INDEX IX_eng_templates_bloqueios_expiracao ON dbo.eng_templates_aprovacao_bloqueios ([expira_em]);
END;

IF OBJECT_ID(N'dbo.eng_templates_aprovacao_autosalvamentos', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.eng_templates_aprovacao_autosalvamentos (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_eng_templates_aprovacao_autosalvamentos PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [template_id] UNIQUEIDENTIFIER NOT NULL,
    [versao_id] UNIQUEIDENTIFIER NOT NULL,
    [sessao_id] UNIQUEIDENTIFIER NOT NULL,
    [sequencia] BIGINT NOT NULL CONSTRAINT CK_eng_templates_autosalvamentos_sequencia CHECK ([sequencia] >= 1),
    [template_json] NVARCHAR(MAX) NOT NULL CONSTRAINT CK_eng_templates_autosalvamentos_json CHECK (ISJSON([template_json]) = 1),
    [usuario] NVARCHAR(300) NOT NULL,
    [criado_em] DATETIME2(3) NOT NULL CONSTRAINT DF_eng_templates_autosalvamentos_criado_em DEFAULT SYSDATETIME(),
    [expira_em] DATETIME2(3) NOT NULL,
    CONSTRAINT CK_eng_templates_autosalvamentos_expiracao CHECK ([expira_em] > [criado_em]),
    CONSTRAINT UQ_eng_templates_autosalvamentos_sessao_sequencia UNIQUE ([sessao_id], [sequencia]),
    CONSTRAINT FK_eng_templates_autosalvamentos_versao FOREIGN KEY ([versao_id], [template_id]) REFERENCES dbo.eng_templates_aprovacao_versoes([id], [template_id])
  );

  CREATE NONCLUSTERED INDEX IX_eng_templates_autosalvamentos_expiracao ON dbo.eng_templates_aprovacao_autosalvamentos ([expira_em]);
END;

IF OBJECT_ID(N'dbo.eng_templates_aprovacao_componentes', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.eng_templates_aprovacao_componentes (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_eng_templates_aprovacao_componentes PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [codigo] VARCHAR(80) NOT NULL,
    [nome] NVARCHAR(400) NOT NULL,
    [descricao] NVARCHAR(2000) NULL,
    [tipo] VARCHAR(30) NOT NULL CONSTRAINT CK_eng_templates_aprovacao_componentes_tipo CHECK ([tipo] IN ('cabecalho','rodape','legenda','bloco_dados','estilo_cota','moldura','outro')),
    [versao_publicada_id] UNIQUEIDENTIFIER NULL,
    [ativo] BIT NOT NULL CONSTRAINT DF_eng_templates_aprovacao_componentes_ativo DEFAULT 1,
    [criado_em] DATETIME2(3) NOT NULL CONSTRAINT DF_eng_templates_aprovacao_componentes_criado_em DEFAULT SYSDATETIME(),
    [criado_por] NVARCHAR(300) NOT NULL,
    [atualizado_em] DATETIME2(3) NOT NULL CONSTRAINT DF_eng_templates_aprovacao_componentes_atualizado_em DEFAULT SYSDATETIME(),
    [atualizado_por] NVARCHAR(300) NOT NULL,
    [row_version] ROWVERSION NOT NULL,
    CONSTRAINT UQ_eng_templates_aprovacao_componentes_codigo UNIQUE ([codigo]),
    CONSTRAINT UQ_eng_templates_aprovacao_componentes_id_check UNIQUE ([id])
  );
END;

IF OBJECT_ID(N'dbo.eng_templates_aprovacao_componentes_versoes', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.eng_templates_aprovacao_componentes_versoes (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_eng_templates_aprovacao_componentes_versoes PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [componente_id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_eng_templates_componentes_versoes_componente REFERENCES dbo.eng_templates_aprovacao_componentes([id]),
    [numero_versao] INT NOT NULL CONSTRAINT CK_eng_templates_componentes_versoes_numero CHECK ([numero_versao] >= 1),
    [status] VARCHAR(30) NOT NULL CONSTRAINT DF_eng_templates_componentes_versoes_status DEFAULT 'rascunho'
      CONSTRAINT CK_eng_templates_componentes_versoes_status CHECK ([status] IN ('rascunho','em_teste','publicado','arquivado')),
    [componente_json] NVARCHAR(MAX) NOT NULL CONSTRAINT CK_eng_templates_componentes_versoes_json CHECK (ISJSON([componente_json]) = 1),
    [svg_preview] NVARCHAR(MAX) NULL,
    [observacao] NVARCHAR(4000) NULL,
    [criado_em] DATETIME2(3) NOT NULL CONSTRAINT DF_eng_templates_componentes_versoes_criado_em DEFAULT SYSDATETIME(),
    [criado_por] NVARCHAR(300) NOT NULL,
    [atualizado_em] DATETIME2(3) NOT NULL CONSTRAINT DF_eng_templates_componentes_versoes_atualizado_em DEFAULT SYSDATETIME(),
    [atualizado_por] NVARCHAR(300) NOT NULL,
    [publicado_em] DATETIME2(3) NULL,
    [publicado_por] NVARCHAR(300) NULL,
    [row_version] ROWVERSION NOT NULL,
    CONSTRAINT UQ_eng_templates_componentes_versoes_numero UNIQUE ([componente_id], [numero_versao]),
    CONSTRAINT UQ_eng_templates_componentes_versoes_componente_id_id UNIQUE ([componente_id], [id])
  );
END;

IF OBJECT_ID(N'dbo.eng_templates_aprovacao_componentes', N'U') IS NOT NULL
  AND OBJECT_ID(N'dbo.eng_templates_aprovacao_componentes_versoes', N'U') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_eng_templates_componentes_versao_publicada')
BEGIN
  ALTER TABLE dbo.eng_templates_aprovacao_componentes
    ADD CONSTRAINT FK_eng_templates_componentes_versao_publicada
    FOREIGN KEY ([versao_publicada_id], [id])
    REFERENCES dbo.eng_templates_aprovacao_componentes_versoes ([id], [componente_id]);
END;

COMMIT TRANSACTION;
